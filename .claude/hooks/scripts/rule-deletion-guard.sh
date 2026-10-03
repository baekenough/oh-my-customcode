#!/bin/bash
# rule-deletion-guard.sh — Block rule file deletion without individual user confirmation (#1782)
#
# Path-aware (python3): a quote-aware shell lexer resolves rm/mv/unlink/rmdir/shred/truncate,
# find -delete/-exec, xargs <destructive>, git rm|mv|clean and writing redirects (> >| >> &> &>> >&)
# against the PROJECT rule dirs (<root>/.claude/rules and <root>/templates/.claude/rules).
# Inside a rule dir -> block. Ancestor of a rule dir -> block only for recursive delete/move.
# Structural fail-closed: anything the analyzer does not positively model (unknown wrapper before a
# destructive verb, destructive verb in a non-head position, unresolvable expansion in a target,
# opaque constructs such as eval / sh -c / $(...) / backticks / source, parse errors, unknown cwd,
# analyzer exceptions) -> strict legacy regex check (blocks if the pre-#1782 logic would block).
# No python3: legacy regex check (needs jq). Neither python3 nor jq: fail-open (exit 0).

set -uo pipefail

input=$(cat)

# Legacy regex logic (verbatim semantics of the pre-#1782 guard). Arg: command string. Exits 2 on block.
# Arg 2 = "strict": used after python fallbacks; the verb may also follow a quote/paren/slash
# (e.g. bash -c 'rm ...', /bin/rm) so the fallback is never weaker than the analyzer's intent.
legacy_check() {
  local cmd="$1" targets target_count filename
  local pre='(^|\s)'
  [ "${2:-}" = "strict" ] && pre='(^|[^[:alnum:]_-])'

  # Check if command would delete parent directories containing rules
  if echo "$cmd" | grep -qE "${pre}(rm|git\s+rm|mv|unlink)\s" && echo "$cmd" | grep -qE '\.claude/?(\s|$)'; then
    echo "[Hook] ⛔ RULE DELETION BLOCKED — Parent directory deletion detected" >&2
    echo "[Hook] This command combines a delete/move verb with a .claude/ directory reference (pattern check)." >&2
    echo "[Hook] Delete rules individually with user confirmation." >&2
    echo "[Hook] 룰 파일 수정은 Write/Edit 도구를 사용하십시오 (셸 리다이렉트/삭제 금지)." >&2
    exit 2
  fi

  # Check if command targets .claude/rules/ for deletion (including mv, unlink)
  if echo "$cmd" | grep -qE "${pre}(rm|git\s+rm|mv|unlink)\s" && echo "$cmd" | grep -qE '\.claude/rules(/|\s|$)'; then
    targets=$(echo "$cmd" | grep -oE '\.claude/rules/[^ ]+' | tr '\n' ', ' | sed 's/,$//')
    target_count=$(echo "$cmd" | grep -oE '\.claude/rules/[^ ]+' | wc -l | tr -d ' ')

    if echo "$cmd" | grep -qE '\.claude/rules/\*|\.claude/rules/[^ ]*\*' || [ "$target_count" -gt 1 ]; then
      echo "[Hook] ⛔ RULE DELETION BLOCKED — Multiple rules detected" >&2
      echo "[Hook] Targets: $targets" >&2
      echo "[Hook] Rule files must be deleted ONE AT A TIME with user confirmation." >&2
      echo "[Hook] Delete each rule individually after asking: \"정말 {파일명}을(를) 삭제하시겠습니까?\"" >&2
      echo "[Hook] 룰 파일 수정은 Write/Edit 도구를 사용하십시오 (셸 리다이렉트/삭제 금지)." >&2
      exit 2
    fi

    filename=$(basename "$targets" 2>/dev/null || echo "$targets")
    echo "[Hook] ⛔ RULE DELETION BLOCKED" >&2
    echo "[Hook] Target: $filename" >&2
    echo "[Hook] Rule files require individual user confirmation before deletion." >&2
    echo "[Hook] Ask the user: \"정말 ${filename}을(를) 삭제하시겠습니까?\"" >&2
    echo "[Hook] Only proceed after explicit user approval." >&2
    echo "[Hook] 룰 파일 수정은 Write/Edit 도구를 사용하십시오 (셸 리다이렉트/삭제 금지)." >&2
    exit 2
  fi
}

pass() { printf '%s\n' "$input"; exit 0; }

# Analyzer (script on fd 3; stdin carries the hook JSON, so the payload size is not bound by ARG_MAX).
run_analyzer() {
  python3 /dev/fd/3 3<<'PY'
import fnmatch
import glob as globmod
import json
import os
import re
import sys

# Exit codes: 0 allow, 2 block (message on stderr), 3 fall back to legacy (stdout = command)


class Fallback(Exception):
    pass


class Word(object):
    __slots__ = ('v', 'exp', 'tilde', 'brace', 'raw')

    def __init__(self, v, exp, tilde, brace, raw):
        self.v, self.exp, self.tilde, self.brace, self.raw = v, exp, tilde, brace, raw


OPAQUE = re.compile(
    r'(?<![\w-])eval(?![\w-])|\$\(|`'
    r'|(?<![\w-])(?:ba|z|da|k)?sh\b[^\n;|&]*?\s-\w*c\b'
    r'|(?<![\w-])(?:ba|z|da|k)?sh\b[^\n;|&]*<<'
    r'|(?<![\w-])source(?![\w-])'
)
VAR = re.compile(r'^[A-Za-z_]\w*=')
GLOBCH = re.compile(r'[*?\[]')
OPS = ['<<<', '<<-', '&>>', ';;&', '&&', '||', '|&', ';;', ';&', '>>', '>|', '>&', '<&', '<>', '<<', '&>',
       ';', '&', '|', '(', ')', '<', '>']
SEP = {';', '&', '&&', '||', '|', '|&', ';;', ';&', ';;&', '(', ')'}
WREDIR = {'>', '>|', '>>', '&>', '&>>', '<>'}
OREDIR = {'<', '<<<', '<&', '<<', '<<-'}
DESTR = {'rm', 'unlink', 'rmdir', 'shred', 'truncate'}
DWORDS = DESTR | {'mv', 'xargs'}
FINDACT = {'-delete', '-exec', '-execdir', '-ok', '-okdir'}
FINDFILT = {'-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex'}
RESERVED = {'if', 'then', 'do', 'else', 'elif', 'while', 'until', '!', '{', '}'}
# wrapper -> (options taking a separate value, leading positionals before the command)
WRAP = {
    'sudo': ({'-u', '-g', '-h', '-p', '-C', '-D', '-R', '-T', '-U', '-r', '-t'}, 0),
    'doas': ({'-u', '-C'}, 0),
    'command': (set(), 0), 'builtin': (set(), 0), 'exec': ({'-a'}, 0),
    'env': ({'-u', '-C', '-S', '-P', '--unset', '--chdir', '--split-string'}, 0),
    'nice': ({'-n', '--adjustment'}, 0), 'nohup': (set(), 0), 'time': ({'-f', '-o'}, 0),
    'timeout': ({'-s', '-k', '--signal', '--kill-after'}, 1),
    'gtimeout': ({'-s', '-k', '--signal', '--kill-after'}, 1),
    'stdbuf': ({'-i', '-o', '-e', '--input', '--output', '--error'}, 0),
    'caffeinate': ({'-t', '-w'}, 0), 'busybox': (set(), 0), 'ionice': ({'-c', '-n', '-p', '-t'}, 0),
    'chronic': (set(), 0), 'nocorrect': (set(), 0), 'noglob': (set(), 0),
}
GIT_VAL = {'-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'}


def lex(s):
    """Quote-aware shell tokenizer: [('op', str) | ('w', Word)]. Raises Fallback when unsure."""
    toks, pend = [], []
    n, i = len(s), 0
    st = {'w': None, 'delim': False}

    def start():
        if st['w'] is None:
            st['w'] = {'v': [], 'exp': False, 'tilde': False, 'ub': False, 'i': i}
        return st['w']

    def end(j):
        w = st['w']
        if w is None:
            return
        v = ''.join(w['v'])
        brace = w['ub'] and v not in ('{', '}', '{}') and '}' in v and (',' in v or '..' in v)
        st['w'] = None
        if st['delim']:
            pend.append(v)
            st['delim'] = False
            return
        toks.append(('w', Word(v, w['exp'], w['tilde'], brace, s[w['i']:j])))

    while i < n:
        c = s[i]
        if c == '#' and st['w'] is None:
            j = s.find('\n', i)
            i = n if j < 0 else j
            continue
        if c in ' \t':
            end(i)
            i += 1
            continue
        if c == '\n':
            end(i)
            if st['delim']:
                raise Fallback()
            toks.append(('op', ';'))
            i += 1
            for d in pend:
                while True:
                    if i >= n:
                        raise Fallback()  # unterminated heredoc
                    j = s.find('\n', i)
                    line = s[i:] if j < 0 else s[i:j]
                    i = n if j < 0 else j + 1
                    if line.strip() == d:
                        break
            del pend[:]
            continue
        if c in ';&|<>()':
            w = st['w']
            if c in '<>' and w is not None and w['v'] and all(ch.isdigit() for ch in w['v']) and s[w['i']:i].isdigit():
                st['w'] = None  # fd number before a redirect
            else:
                end(i)
            if c in '<>' and i + 1 < n and s[i + 1] == '(':
                raise Fallback()  # process substitution
            op = next(o for o in OPS if s.startswith(o, i))
            if st['delim']:
                raise Fallback()
            toks.append(('op', op))
            if op in ('<<', '<<-'):
                st['delim'] = True
            i += len(op)
            continue
        if c == '\\':
            w = start()
            if i + 1 < n:
                w['v'].append(s[i + 1])
            i += 2
            continue
        if c == "'":
            w = start()
            j = s.find("'", i + 1)
            if j < 0:
                raise Fallback()
            w['v'].append(s[i + 1:j])
            i = j + 1
            continue
        if c == '"' or (c == '$' and s.startswith('$"', i)):
            w = start()
            i += 2 if c == '$' else 1
            while True:
                if i >= n:
                    raise Fallback()
                ch = s[i]
                if ch == '"':
                    i += 1
                    break
                if ch == '\\' and i + 1 < n and s[i + 1] in '$`"\\\n':
                    w['v'].append(s[i + 1])
                    i += 2
                    continue
                if ch in '$`':
                    if ch == '`' or s.startswith('$(', i):
                        raise Fallback()
                    w['exp'] = True
                w['v'].append(ch)
                i += 1
            continue
        if c == '$' and s.startswith("$'", i):
            w = start()
            j, buf = i + 2, []
            while True:
                if j >= n:
                    raise Fallback()
                if s[j] == '\\' and j + 1 < n:
                    buf.append(s[j:j + 2])
                    j += 2
                    continue
                if s[j] == "'":
                    break
                buf.append(s[j])
                j += 1
            try:
                w['v'].append(''.join(buf).encode('latin-1', 'backslashreplace').decode('unicode_escape'))
            except Exception:
                w['exp'] = True
            i = j + 1
            continue
        if c == '`' or (c == '$' and s.startswith('$(', i)):
            raise Fallback()
        if c == '$':
            start()['exp'] = True
        if c == '~' and st['w'] is None:
            start()['tilde'] = True
        if c == '{':
            start()['ub'] = True
        start()['v'].append(c)
        i += 1
    end(n)
    if st['delim'] or pend:
        raise Fallback()
    return toks


def low(s):
    return s.lower()


def main(d, cmd):
    start = d.get('cwd')
    if isinstance(start, str) and os.path.isdir(start):
        start = os.path.realpath(start)
    else:
        start = os.getcwd()
    root = os.environ.get('CLAUDE_PROJECT_DIR')
    if not root:
        try:
            import subprocess
            r = subprocess.run(['git', '-C', start, 'rev-parse', '--show-toplevel'],
                               capture_output=True, text=True, timeout=5)
            root = r.stdout.strip() if r.returncode == 0 else ''
        except Exception:
            root = ''
        root = root or start
    root = os.path.realpath(root)
    prot = [low(os.path.join(root, '.claude', 'rules')),
            low(os.path.join(root, 'templates', '.claude', 'rules'))]

    cmd = cmd.replace('\r', '').replace('\\\n', '')
    if OPAQUE.search(cmd):
        return 3
    try:
        toks = lex(cmd)
    except Fallback:
        return 3

    hits = []
    fb = [False]
    shvars = {}

    def rp(p):
        b = os.path.basename(p)
        if p.endswith('/') or b in ('', '.', '..'):
            return os.path.realpath(p)
        return os.path.join(os.path.realpath(os.path.dirname(p)), b)

    def classify(r):
        rl = low(r).rstrip('/') or '/'
        for p in prot:
            if rl == p or rl.startswith(p + '/'):
                return 'inside'
        for p in prot:
            if rl == '/' or p.startswith(rl + '/'):
                return 'anc'
        return None

    def value(w):
        if w.brace:
            raise Fallback()
        v = w.v
        if w.exp:
            raw = w.raw
            names = re.findall(r'\$\{(\w+)\}|\$(\w+)', raw)
            if raw.count('$') != len(names) or "'" in raw or '\\' in raw:
                raise Fallback()
            for a, b in names:
                if shvars.get(a or b) is None:
                    raise Fallback()
            v = re.sub(r'\$\{(\w+)\}|\$(\w+)', lambda m: shvars[m.group(1) or m.group(2)], raw).replace('"', '')
        if w.tilde:
            if v == '~' or v.startswith('~/'):
                v = os.path.expanduser(v)
            else:
                raise Fallback()
        return v

    def check(w, cwd, anc):
        """anc: what an ANCESTOR of a rule dir means here: 'block' | 'fallback' | 'ignore'."""
        try:
            v = value(w)
            if not os.path.isabs(v):
                if cwd is None:
                    raise Fallback()
                v = os.path.join(cwd, v)
        except Fallback:
            fb[0] = True
            return
        isglob = bool(GLOBCH.search(v))
        if isglob:
            static = []
            for p in v.split('/'):
                if GLOBCH.search(p):
                    break
                static.append(p)
            pre = os.path.realpath('/'.join(static) or '/')
            if classify(pre) == 'inside':
                hits.append((pre, True, 'inside'))
            paths = [rp(m) for m in globmod.glob(v)]
        else:
            paths = [rp(v)]
        for r in paths:
            c = classify(r)
            if c == 'inside':
                hits.append((r, isglob, 'inside'))
            elif c == 'anc':
                if anc == 'block':
                    hits.append((r, isglob, 'anc'))
                elif anc == 'fallback':
                    fb[0] = True

    def names(words):
        out = set()
        for w in words:
            if not w.exp and w.v and not any(ch.isspace() for ch in w.v):
                out.add(os.path.basename(w.v) or w.v)
        return out

    def risky(words):
        """True when an unmodelled position holds a destructive verb word."""
        nm = names(words)
        return bool(nm & DWORDS) or ('find' in nm and bool(nm & FINDACT)) or ('git' in nm and 'clean' in nm)

    def unwrap(argv, cwd):
        argv = list(argv)
        while argv:
            while argv and not argv[0].exp and VAR.match(argv[0].v):
                argv.pop(0)
            if not argv or argv[0].exp:
                break
            h = argv[0].v
            if h in RESERVED:
                argv.pop(0)
                continue
            b = os.path.basename(h)
            if b not in WRAP:
                break
            vals, npos = WRAP[b]
            argv.pop(0)
            if b == 'busybox':
                continue
            while argv and argv[0].v.startswith('-') and not argv[0].exp:
                o = argv.pop(0).v
                if o == '--':
                    break
                key, _, joined = o.partition('=')
                if b == 'env' and key in ('-S', '--split-string'):
                    raise Fallback()
                if b == 'env' and key in ('-C', '--chdir'):
                    if not joined:
                        if not argv:
                            break
                        dw = argv.pop(0)
                    else:
                        dw = Word(joined, '$' in joined, False, False, joined)
                    try:
                        dv = value(dw)
                        cwd = None if cwd is None and not os.path.isabs(dv) else \
                            os.path.realpath(dv if os.path.isabs(dv) else os.path.join(cwd, dv))
                    except Fallback:
                        cwd = None
                    continue
                if o in vals and argv:
                    argv.pop(0)
            for _ in range(npos):
                if argv:
                    argv.pop(0)
        return argv, cwd

    def git_split(args, cwd):
        i = 0
        while i < len(args) and args[i].v.startswith('-'):
            o = args[i].v
            if o in GIT_VAL and i + 1 < len(args):
                if o == '-C':
                    try:
                        p = value(args[i + 1])
                        cwd = None if (cwd is None and not os.path.isabs(p)) else \
                            os.path.realpath(p if os.path.isabs(p) else os.path.join(cwd, p))
                    except Fallback:
                        cwd = None
                i += 2
            else:
                i += 1
        if i >= len(args) or args[i].exp:
            return None, [], cwd
        return args[i].v, args[i + 1:], cwd

    def kind(argv, cwd):
        """'destr' | 'risky' | None for a (possibly wrapped) command."""
        try:
            argv, _ = unwrap(argv, cwd)
        except Fallback:
            return 'risky'
        if not argv:
            return None
        if argv[0].exp:
            return 'risky'
        v = os.path.basename(argv[0].v)
        if v in DESTR or v == 'mv':
            return 'destr'
        if v == 'git':
            sub, _, _ = git_split(argv[1:], cwd)
            if sub in ('rm', 'mv', 'clean'):
                return 'destr'
        return 'risky' if risky(argv[1:]) else None

    def opts_pos(args, valopts=()):
        opts, posl, i, rest = [], [], 0, False
        while i < len(args):
            a = args[i]
            if rest or a.exp or not a.v.startswith('-') or a.v == '-':
                posl.append(a)
            elif a.v == '--':
                rest = True
            else:
                opts.append(a.v)
                if a.v in valopts and i + 1 < len(args):
                    i += 1
            i += 1
        return opts, posl

    def short_has(opts, ch):
        return any(o.startswith('-') and not o.startswith('--') and ch in o[1:] for o in opts)

    def mv_targets(args, cwd):
        dest, plain, i = None, [], 0
        while i < len(args):
            a = args[i].v
            if a in ('-t', '--target-directory') and i + 1 < len(args):
                dest = args[i + 1]
                i += 2
                continue
            if a.startswith('--target-directory='):
                j = a.split('=', 1)[1]
                dest = Word(j, '$' in j, False, False, j)
            elif a in ('-S', '--suffix') and i + 1 < len(args):
                i += 2
                continue
            else:
                plain.append(args[i])
            i += 1
        _, plain = opts_pos(plain)
        if dest is None and plain:
            dest = plain[-1]
            plain = plain[:-1]
        for s in plain:
            check(s, cwd, 'block')
        if dest is not None:
            check(dest, cwd, 'ignore')

    class Unsup(Exception):
        pass

    def find_compile(expr):
        """Compile a find expression into a predicate over (disp, name, isdir, depth)."""
        toks = [w.v for w in expr]
        depth = {'max': None, 'min': 0}
        pos = [0]
        TRUEOPS = {'-delete', '-print', '-print0', '-ls', '-depth', '-d', '-xdev', '-mount', '-follow',
                   '-noleaf', '-ignore_readdir_race', '-true'}

        def peek():
            return toks[pos[0]] if pos[0] < len(toks) else None

        def take():
            t = peek()
            pos[0] += 1
            return t

        def arg():
            if pos[0] >= len(toks):
                raise Unsup()
            return take()

        def primary():
            t = take()
            if t == '(':
                e = p_or()
                if take() != ')':
                    raise Unsup()
                return e
            if t in ('-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename'):
                pat, ci, onpath = arg(), t.startswith('-i'), t not in ('-name', '-iname')
                if ci:
                    pat = pat.lower()
                return lambda c, pat=pat, ci=ci, onpath=onpath: fnmatch.fnmatchcase(
                    (c[0] if onpath else c[1]).lower() if ci else (c[0] if onpath else c[1]), pat)
            if t == '-type':
                ty = arg()
                if not set(ty.split(',')) <= {'f', 'd'}:
                    raise Unsup()
                tys = set(ty.split(','))
                return lambda c, tys=tys: ('d' if c[2] else 'f') in tys
            if t in ('-maxdepth', '-mindepth'):
                n = arg()
                if not n.isdigit():
                    raise Unsup()
                depth['max' if t == '-maxdepth' else 'min'] = int(n)
                return lambda c: True
            if t in TRUEOPS:
                return lambda c: True
            if t in ('-exec', '-execdir', '-ok', '-okdir'):
                while peek() is not None and peek() not in (';', '+'):
                    take()
                if take() is None:
                    raise Unsup()
                return lambda c: True
            raise Unsup()

        def p_not():
            if peek() in ('!', '-not'):
                take()
                e = p_not()
                return lambda c, e=e: not e(c)
            return primary()

        def p_and():
            e = p_not()
            while peek() is not None and peek() not in (')', '-o', '-or'):
                if peek() in ('-a', '-and'):
                    take()
                r = p_not()
                e = (lambda l, r: lambda c: l(c) and r(c))(e, r)
            return e

        def p_or():
            e = p_and()
            while peek() in ('-o', '-or'):
                take()
                r = p_and()
                e = (lambda l, r: lambda c: l(c) or r(c))(e, r)
            return e

        e = p_or() if toks else (lambda c: True)
        if pos[0] != len(toks):
            raise Unsup()
        return e, depth

    def find_start(a, cwd, expr):
        try:
            sv = value(a)
            sabs = sv if os.path.isabs(sv) else (None if cwd is None else os.path.join(cwd, sv))
            if sabs is None or GLOBCH.search(sv):
                raise Fallback()
        except Fallback:
            fb[0] = True
            return
        sreal = os.path.realpath(sabs)
        c = classify(sreal)
        if c is None:
            return
        try:
            pred, depth = find_compile(expr)
        except Unsup:
            rl = low(sreal).rstrip('/') or '/'
            rootl = low(root)
            if rl == rootl or rootl.startswith(rl.rstrip('/') + '/') or rl == '/':
                fb[0] = True  # project root or above: legacy decides
            else:
                hits.append((sreal, False, c))
            return
        sl = low(sreal).rstrip('/')
        for p in prot:
            if p == sl or p.startswith(sl + '/'):
                walk_root = sreal + p[len(sl):]
            elif sl.startswith(p + '/'):
                walk_root = sreal
            else:
                continue
            if not os.path.exists(walk_root):
                continue
            entries = [(walk_root, os.path.isdir(walk_root))]
            if os.path.isdir(walk_root) and not os.path.islink(walk_root):
                for dp, dns, fns in os.walk(walk_root):
                    entries += [(os.path.join(dp, x), True) for x in dns]
                    entries += [(os.path.join(dp, x), False) for x in fns]
            for path, isdir in entries:
                rel = os.path.relpath(path, sreal)
                d = 0 if rel == '.' else rel.count(os.sep) + 1
                if d < depth['min'] or (depth['max'] is not None and d > depth['max']):
                    continue
                disp = sv if rel == '.' else (sv.rstrip('/') + '/' + rel)
                name = os.path.basename(disp.rstrip('/')) or disp
                if pred((disp, name, isdir, d)):
                    hits.append((path, False, 'inside'))
                    return

    xargs_pipes = []
    segs = []

    def handle(argv, cwd, pipe_id):
        try:
            argv, cwd2 = unwrap(argv, cwd)
        except Fallback:
            fb[0] = True
            return cwd
        if not argv:
            return cwd
        if argv[0].exp:
            fb[0] = True
            return cwd
        v = os.path.basename(argv[0].v)
        args = argv[1:]
        if v in ('cd', 'pushd', 'popd'):
            if cwd2 is not cwd:
                return None
            if v != 'cd':
                return None
            if not args:
                return os.path.expanduser('~')
            tgt = [a for a in args if not (a.v.startswith('-') and a.v != '-')]
            if len(tgt) != 1 or tgt[0].v == '-':
                return None
            try:
                t = value(tgt[0])
            except Fallback:
                return None
            if not os.path.isabs(t):
                if cwd is None:
                    return None
                t = os.path.join(cwd, t)
            return os.path.realpath(t)
        shell_cwd, cwd = cwd, cwd2
        if v in DESTR:
            opts, posl = opts_pos(args, {'-s', '--size', '-r', '--reference', '-n', '--iterations'}
                                  if v in ('truncate', 'shred') else ())
            rec = v == 'rm' and (short_has(opts, 'r') or short_has(opts, 'R') or '--recursive' in opts)
            for a in posl:
                check(a, cwd, 'block' if rec else 'fallback')
        elif v == 'mv':
            mv_targets(args, cwd)
        elif v == 'git':
            sub, rest, gcwd = git_split(args, cwd)
            if sub is None:
                if risky(args):
                    fb[0] = True
            elif sub == 'rm':
                opts, posl = opts_pos(rest, {'--pathspec-from-file'})
                if not ('-n' in opts or '--dry-run' in opts or short_has(opts, 'n')):
                    rec = short_has(opts, 'r')
                    for a in posl:
                        check(a, gcwd, 'block' if rec else 'fallback')
            elif sub == 'mv':
                mv_targets(rest, gcwd)
            elif sub == 'clean':
                opts, posl = opts_pos(rest, {'-e', '--exclude'})
                if not (short_has(opts, 'n') or '--dry-run' in opts):
                    rec = short_has(opts, 'd')
                    if posl:
                        for a in posl:
                            check(a, gcwd, 'block' if rec else 'ignore')
                    elif gcwd is None:
                        fb[0] = True
                    else:
                        check(Word(gcwd, False, False, False, gcwd), gcwd, 'block' if rec else 'ignore')
            elif risky(rest):
                fb[0] = True
        elif v == 'find':
            j, destructive = 0, '-delete' in [a.v for a in args]
            while j < len(args):
                if args[j].v in ('-exec', '-execdir', '-ok', '-okdir'):
                    k = j + 1
                    while k < len(args) and args[k].v not in (';', '+'):
                        k += 1
                    body = args[j + 1:k]
                    kd = kind(body, cwd) if body else None
                    if kd == 'destr':
                        destructive = True
                    elif kd == 'risky':
                        fb[0] = True
                    if body:
                        handle(body, cwd, pipe_id)
                    j = k
                j += 1
            if destructive:
                k = 0
                while k < len(args) and args[k].v in ('-H', '-L', '-P', '-D', '-E', '-X', '-d', '-s', '-x') \
                        or (k < len(args) and args[k].v.startswith('-O')):
                    k += 2 if args[k].v == '-D' else 1
                starts = []
                while k < len(args) and not (args[k].v.startswith('-') or args[k].v in ('(', '!', ')')):
                    starts.append(args[k])
                    k += 1
                expr = args[k:]
                for a in (starts or [Word('.', False, False, False, '.')]):
                    find_start(a, cwd, expr)
        elif v == 'xargs':
            i = 0
            valopts = {'-I', '-J', '-L', '-n', '-P', '-R', '-S', '-s', '-E', '-a', '-d',
                       '--max-args', '--max-procs', '--delimiter', '--arg-file', '--max-chars',
                       '--process-slot-var'}
            while i < len(args) and args[i].v.startswith('-') and not args[i].exp:
                if args[i].v == '--':
                    i += 1
                    break
                i += 2 if args[i].v in valopts else 1
            inner = args[i:]
            kd = kind(inner, cwd) if inner else None
            if kd == 'destr':
                xargs_pipes.append(pipe_id)
            elif kd == 'risky':
                fb[0] = True
            if inner:
                handle(inner, cwd, pipe_id)
        elif risky(args):
            fb[0] = True
        return shell_cwd

    cur, pipe_id, stack, cwd = [], 0, [], start
    pending_redir = [None]

    def flush():
        nonlocal cwd
        if pending_redir[0] is not None:
            raise Fallback()
        if not cur:
            return
        argv = [x for x in cur if not isinstance(x, tuple)]
        for op, w in [x for x in cur if isinstance(x, tuple)]:
            if op in WREDIR or (op == '>&' and not re.match(r'^(\d+|-)$', w.v)):
                check(w, cwd, 'ignore')
        if argv and all(not w.exp and VAR.match(w.v) for w in argv):
            for w in argv:
                k, _, val = w.v.partition('=')
                shvars[k] = None if (w.brace or w.tilde or GLOBCH.search(val)) else val
        segs.append((pipe_id, argv, cwd))
        cwd = handle(argv, cwd, pipe_id)
        del cur[:]

    try:
        for kindt, t in toks:
            if kindt == 'w':
                if pending_redir[0] is not None:
                    cur.append((pending_redir[0], t))
                    pending_redir[0] = None
                else:
                    cur.append(t)
                continue
            if t in SEP:
                flush()
                if t == '(':
                    stack.append(cwd)
                elif t == ')' and stack:
                    cwd = stack.pop()
                if t not in ('|', '|&'):
                    pipe_id += 1
            elif t in ('<<', '<<-'):
                continue  # delimiter and body already consumed by the lexer
            elif t in WREDIR or t in OREDIR or t == '>&':
                if pending_redir[0] is not None:
                    raise Fallback()
                pending_redir[0] = t
            else:
                raise Fallback()
        flush()
    except Fallback:
        return 3

    for pid in set(xargs_pipes):
        for sp, sargv, scwd in segs:
            if sp != pid or not sargv or os.path.basename(sargv[0].v) == 'xargs':
                continue
            for a in sargv[1:]:
                if a.v.startswith('-') or a.exp:
                    continue
                check(a, scwd, 'fallback')

    if not hits:
        return 3 if fb[0] else 0

    anc = [h for h in hits if h[2] == 'anc']
    hnames = sorted({h[0] for h in hits})
    if anc:
        print("[Hook] ⛔ RULE DELETION BLOCKED — Parent directory deletion detected", file=sys.stderr)
        print("[Hook] Target: %s (an ancestor of the project rule directories)" % anc[0][0], file=sys.stderr)
        print("[Hook] This recursive delete/move would also remove .claude/rules (or templates/.claude/rules).",
              file=sys.stderr)
        print("[Hook] Delete rules individually with user confirmation.", file=sys.stderr)
        print("[Hook] 룰 파일 수정은 Write/Edit 도구를 사용하십시오 (셸 리다이렉트/삭제 금지).", file=sys.stderr)
    elif len(hnames) > 1 or any(h[1] for h in hits):
        print("[Hook] ⛔ RULE DELETION BLOCKED — Multiple rules detected", file=sys.stderr)
        print("[Hook] Targets: %s" % ", ".join(hnames), file=sys.stderr)
        print("[Hook] Rule files must be deleted ONE AT A TIME with user confirmation.", file=sys.stderr)
        print("[Hook] Delete each rule individually after asking: \"정말 {파일명}을(를) 삭제하시겠습니까?\"", file=sys.stderr)
        print("[Hook] 룰 파일 수정은 Write/Edit 도구를 사용하십시오 (셸 리다이렉트/삭제 금지).", file=sys.stderr)
    else:
        fn = os.path.basename(hnames[0]) or hnames[0]
        print("[Hook] ⛔ RULE DELETION BLOCKED", file=sys.stderr)
        print("[Hook] Target: %s" % hnames[0], file=sys.stderr)
        print("[Hook] Rule files require individual user confirmation before deletion.", file=sys.stderr)
        print("[Hook] Ask the user: \"정말 %s을(를) 삭제하시겠습니까?\"" % fn, file=sys.stderr)
        print("[Hook] Only proceed after explicit user approval.", file=sys.stderr)
        print("[Hook] 룰 파일 수정은 Write/Edit 도구를 사용하십시오 (셸 리다이렉트/삭제 금지).", file=sys.stderr)
    return 2


try:
    data = json.loads(sys.stdin.buffer.read().decode('utf-8', 'replace'))
except Exception:
    sys.exit(0)
if not isinstance(data, dict):
    sys.exit(0)
tool = data.get('tool_name') or data.get('tool') or ''
ti = data.get('tool_input')
command = ti.get('command') if isinstance(ti, dict) else ''
if tool != 'Bash' or not isinstance(command, str) or not command:
    sys.exit(0)
try:
    rc = main(data, command)
except Exception:
    rc = 3
if rc == 3:
    sys.stdout.write(command)
sys.exit(rc)
PY
}

if command -v python3 &>/dev/null; then
  # Cheap pre-filter: skip the interpreter unless a destructive verb word or '>' appears in the payload.
  if ! printf '%s' "$input" | grep -qE '(^|[^[:alnum:]_]|\\[nrt]|\\u00)(rm|mv|unlink|rmdir|shred|truncate|find|xargs|clean)([^[:alnum:]_]|$)|>'; then
    pass
  fi

  out=$(printf '%s' "$input" | run_analyzer)
  rc=$?
  case "$rc" in
    0) pass ;;
    2) exit 2 ;;
    3) legacy_check "$out" strict; pass ;;
    *)
      # Unexpected interpreter failure: fall back to legacy via jq if possible, else fail-open
      if command -v jq &>/dev/null; then
        cmd=$(printf '%s\n' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null) || pass
        tool=$(printf '%s\n' "$input" | jq -r '.tool_name // .tool // ""' 2>/dev/null) || pass
        [ "$tool" = "Bash" ] && legacy_check "$cmd" strict
      fi
      pass
      ;;
  esac
fi

# python3 absent: legacy regex logic (jq required)
if ! command -v jq &>/dev/null; then
  pass
fi
tool=$(printf '%s\n' "$input" | jq -r '.tool_name // .tool // ""' 2>/dev/null) || pass
cmd=$(printf '%s\n' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null) || pass
if [ "$tool" != "Bash" ]; then
  pass
fi
legacy_check "$cmd"
pass
