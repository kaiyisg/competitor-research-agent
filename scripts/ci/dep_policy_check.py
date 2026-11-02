#!/usr/bin/env python3
# build-order: script
# why-not-higher: repo-local CI gate on dependency manifests; nothing for C360
"""Dependency supply-chain gate (L-076). Stdlib only, copy as-is into any repo.

Fails when:
  1. a direct dependency is not exact-pinned (package.json deps/devDeps/optionalDeps,
     requirements*.txt, pyproject [project].dependencies). Ranges like ^ ~ * >= x latest fail;
     git deps must pin a 40-char commit. peerDependencies are exempt (they are ranges by design).
  2. a manifest with dependencies has no lockfile.
  3. the package manager's native release-age gate is missing or under MIN_DAYS:
     npm  -> .npmrc            min-release-age=7        (npm >= 11.10)
     pnpm -> pnpm-workspace.yaml minimumReleaseAge: 10080 (minutes, pnpm >= 10.16)
     uv   -> pyproject [tool.uv] / uv.toml  exclude-newer = "7 days"
  4. with --base REF: a lockfile entry added or bumped since REF was published < MIN_DAYS ago
     (registry lookup). Installs from an existing lockfile skip the native gate, so this is
     the check that actually holds in CI.
Background: litellm + axios supply-chain attacks. https://x.com/karpathy/status/2036487306585268612
Usage: dep_policy_check.py [--root .] [--base origin/main] [--min-days 7] [--offline]
"""
import argparse, datetime as dt, json, os, re, subprocess, sys, urllib.parse, urllib.request

SKIP_DIRS = {"node_modules", ".git", ".venv", "venv", "dist", "build", ".next", "__pycache__"}
EXACT = re.compile(r"^v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$")
LOCAL = ("workspace:", "file:", "link:", "portal:", "catalog:")


def walk(root, names):
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in files:
            if f in names or any(re.fullmatch(n, f) for n in names if "*" in n or "\\" in n):
                yield os.path.join(d, f)


def npm_spec_ok(spec):
    s = spec.strip()
    if s.startswith(LOCAL):
        return True
    if s.startswith("npm:"):
        return npm_spec_ok(s.rsplit("@", 1)[-1]) if "@" in s[4:].lstrip("@") else False
    if re.match(r"^(git\+|git:|github:|https?://|[\w.-]+/[\w.-]+#?)", s):
        return bool(re.search(r"#[0-9a-f]{40}$", s))
    return bool(EXACT.match(s))


def py_req_ok(line):
    s = line.split("#", 1)[0].strip()
    if not s or s.startswith(("-r", "-c", "--", "-e .", ".")):
        return True
    s = s.split(";", 1)[0].strip()
    if "@" in s and "://" in s:
        return bool(re.search(r"@[0-9a-f]{40}", s)) or "sha256=" in s
    return bool(re.match(r"^[A-Za-z0-9_.\[\],-]+\s*===?\s*[^,*<>~!]+$", s))


def read(p):
    try:
        return open(p, encoding="utf-8").read()
    except OSError:
        return ""


def toml_load(p):
    try:
        import tomllib
        return tomllib.loads(read(p))
    except Exception:
        return {}


def days_from(val):
    """'7 days' / '1 week' / 'P7D' / ISO date -> days, or None."""
    v = str(val).strip().strip('"')
    m = re.fullmatch(r"(\d+)\s*(day|days|d|week|weeks|w)", v)
    if m:
        return int(m[1]) * (7 if m[2].startswith("w") else 1)
    m = re.fullmatch(r"P(\d+)D", v)
    if m:
        return int(m[1])
    return None


def static_checks(root, min_days):
    errs, ecos = [], set()
    for p in walk(root, {"package.json"}):
        rel = os.path.relpath(p, root)
        try:
            pj = json.loads(read(p))
        except ValueError:
            errs.append(f"{rel}: invalid JSON"); continue
        deps = {}
        for k in ("dependencies", "devDependencies", "optionalDependencies"):
            deps.update({n: (k, v) for n, v in (pj.get(k) or {}).items()})
        for n, (k, v) in sorted(deps.items()):
            if not npm_spec_ok(v):
                errs.append(f"{rel}: {k}.{n} = {v!r} is not an exact version (use e.g. {re.sub(r'^[^0-9]*', '', v) or 'x.y.z'})")
        if deps:
            d = os.path.dirname(p)
            up = [d] + [os.path.dirname(d)] * 0
            cur, lock = d, None
            while True:
                for lf, eco in (("pnpm-lock.yaml", "pnpm"), ("package-lock.json", "npm"), ("npm-shrinkwrap.json", "npm"), ("yarn.lock", "yarn"), ("bun.lock", "bun")):
                    if os.path.exists(os.path.join(cur, lf)):
                        lock = (os.path.join(cur, lf), eco); break
                if lock or os.path.abspath(cur) == os.path.abspath(root):
                    break
                cur = os.path.dirname(cur)
            if not lock:
                errs.append(f"{rel}: has dependencies but no lockfile (commit package-lock.json / pnpm-lock.yaml)")
            else:
                ecos.add((lock[1], os.path.dirname(lock[0])))
    for p in walk(root, {r"requirements.*\.txt"}):
        rel = os.path.relpath(p, root)
        for i, line in enumerate(read(p).splitlines(), 1):
            if not py_req_ok(line):
                errs.append(f"{rel}:{i}: {line.strip()!r} is not pinned with ==")
    for p in walk(root, {"pyproject.toml"}):
        rel, t = os.path.relpath(p, root), toml_load(p)
        reqs = list((t.get("project") or {}).get("dependencies") or [])
        for g in ((t.get("project") or {}).get("optional-dependencies") or {}).values():
            reqs += g
        for g in (t.get("dependency-groups") or {}).values():
            reqs += [x for x in g if isinstance(x, str)]
        for r in reqs:
            if not py_req_ok(r):
                errs.append(f"{rel}: dependency {r!r} is not pinned with ==")
        if reqs:
            d = os.path.dirname(p)
            if not any(os.path.exists(os.path.join(d, f)) for f in ("uv.lock", "poetry.lock", "requirements.txt")):
                errs.append(f"{rel}: has dependencies but no lockfile (commit uv.lock)")
            ecos.add(("uv", d))
    for eco, d in sorted(ecos):
        rel = os.path.relpath(d, root)
        if eco == "npm":
            m = re.search(r"^\s*min-release-age\s*=\s*(\d+)", read(os.path.join(d, ".npmrc")) or read(os.path.join(root, ".npmrc")), re.M)
            if not m or int(m[1]) < min_days:
                errs.append(f"{rel}/.npmrc: set min-release-age={min_days} (npm >= 11.10 native release-age gate)")
        elif eco == "pnpm":
            txt = read(os.path.join(d, "pnpm-workspace.yaml")) or read(os.path.join(root, "pnpm-workspace.yaml"))
            m = re.search(r"^minimumReleaseAge:\s*(\d+)", txt, re.M)
            if not m or int(m[1]) < min_days * 1440:
                errs.append(f"{rel}/pnpm-workspace.yaml: set minimumReleaseAge: {min_days * 1440} (minutes, pnpm >= 10.16)")
        elif eco == "uv":
            val = ((toml_load(os.path.join(d, "pyproject.toml")).get("tool") or {}).get("uv") or {}).get("exclude-newer") \
                or toml_load(os.path.join(d, "uv.toml")).get("exclude-newer")
            n = days_from(val) if val else None
            if n is None or n < min_days:
                errs.append(f"{rel}: set [tool.uv] exclude-newer = \"{min_days} days\" (uv native release-age gate)")
        elif eco in ("yarn", "bun"):
            errs.append(f"{rel}: {eco} lockfile found; add its release-age setting and extend this check")
    return errs


def lock_entries(text, name):
    """Return {(pkg, version, registry)} from a lockfile's text."""
    out = set()
    if name in ("package-lock.json", "npm-shrinkwrap.json"):
        try:
            for k, v in (json.loads(text).get("packages") or {}).items():
                if k and "node_modules/" in k and v.get("version") and not v.get("link") and "registry.npmjs.org" in (v.get("resolved") or "registry.npmjs.org"):
                    out.add((k.rsplit("node_modules/", 1)[1], v["version"], "npm"))
        except ValueError:
            pass
    elif name == "pnpm-lock.yaml":
        for m in re.finditer(r"^  '?/?(@?[^@\s'(]+)@(\d[^:'(\s]*)", text, re.M):
            out.add((m[1], m[2], "npm"))
    elif name == "uv.lock":
        for blk in text.split("[[package]]")[1:]:
            n, v = re.search(r'^name = "([^"]+)"', blk, re.M), re.search(r'^version = "([^"]+)"', blk, re.M)
            if n and v and "registry = " in blk:
                out.add((n[1], v[1], "pypi"))
    return out


def published(pkg, ver, reg):
    if reg == "npm":
        u = "https://registry.npmjs.org/" + urllib.parse.quote(pkg, safe="@")
        t = json.load(urllib.request.urlopen(u, timeout=20)).get("time", {}).get(ver)
    else:
        files = json.load(urllib.request.urlopen(f"https://pypi.org/pypi/{pkg}/{ver}/json", timeout=20)).get("urls") or []
        t = min((f["upload_time_iso_8601"] for f in files), default=None)
    return dt.datetime.fromisoformat(t.replace("Z", "+00:00")) if t else None


def age_checks(root, base, min_days):
    errs, now = [], dt.datetime.now(dt.timezone.utc)
    for p in walk(root, {"package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "uv.lock"}):
        rel = os.path.relpath(p, root)
        old = subprocess.run(["git", "-C", root, "show", f"{base}:{rel}"], capture_output=True, text=True).stdout
        new = lock_entries(read(p), os.path.basename(p)) - lock_entries(old, os.path.basename(p))
        for pkg, ver, reg in sorted(new):
            try:
                t = published(pkg, ver, reg)
            except Exception as e:
                errs.append(f"{rel}: could not read publish time for {pkg}@{ver} ({e.__class__.__name__}); retry or check by hand"); continue
            if t and (now - t).total_seconds() < min_days * 86400:
                errs.append(f"{rel}: {pkg}@{ver} published {t:%Y-%m-%d} (< {min_days} days ago); wait or pin an older version")
    return errs


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default="."); ap.add_argument("--base")
    ap.add_argument("--min-days", type=int, default=7); ap.add_argument("--offline", action="store_true")
    a = ap.parse_args(argv)
    errs = static_checks(a.root, a.min_days)
    if a.base and not a.offline:
        errs += age_checks(a.root, a.base, a.min_days)
    for e in errs:
        print("FAIL", e)
    print(f"dep-policy: {'FAIL' if errs else 'OK'} ({len(errs)} issue(s), min age {a.min_days} days)")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
