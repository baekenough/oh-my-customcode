#!/usr/bin/env bash
# bash-cd-advisor.sh — PreToolUse(Bash): 서브셸 밖 최상위 `cd` 감지 (advisory)
#
# 배경 (#1834 / #1816 H2, R005 "Bash `cd`는 세션 cwd로 남습니다"):
#   Bash 도구에서 괄호 밖에 놓인 `cd`는 세션 cwd로 남아(CwdChanged 발화로 확인) 이후 명령의
#   상대 경로를 어긋나게 한다. `cd X && ( … )`도 `cd`가 서브셸 밖이므로 지속 `cd`다.
#   안전한 형태는 절대 경로 또는 `( cd <dir> && … )`.
#
# 역할:
#   .tool_input.command 에서 괄호 깊이 0, 따옴표/`$( … )`/백틱/히어독 본문 밖의 `cd`/`pushd`/`popd`
#   명령어 단어를 찾으면 한국어 advisory 한 단락을 전달한다. 그 외에는 아무것도 출력하지 않는다.
#   명령 시작 위치 = 문장 처음, `&&` `||` `;` 개행 `|` `&` 뒤, 그리고 접두 키워드(`then` `do` `else`
#   `elif` `if` `while` `until` `{` `!` `time` `builtin` `command`)와 선행 `VAR=value` 할당 뒤.
#   파이프의 마지막이 아닌 구간(`cd x | b`)과 백그라운드(`cd x &`)의 cd 는 서브셸에서 실행되어 cwd가
#   남지 않으므로 감지하지 않는다. 파이프의 마지막 구간(`a | cd x`)은 감지한다: 이 규칙은 zsh 의미론을
#   따른다 — Bash 도구의 셸이 zsh(측정: $ZSH_VERSION=5.9)이고 zsh 는 마지막 파이프 요소를 현재 셸에서
#   실행한다(`zsh -fc 'cd /; echo x | cd /tmp; pwd'` → /tmp; bash 는 `/` 라 남지 않는다).
#
# 구현: 스캐너는 awk 한 번의 선형 패스(LC_ALL=C, 바이트 단위)다. 측정(macOS, awk 20200816): 30K자 0.03s.
#   `cd`/`pushd`/`popd` 부분문자열이 없는 명령은 스캐너를 건너뛴다.
#
# 전달 경로 (Measured):
#   CC 2.1.310, `claude -p`, haiku(claude-haiku-5-5), 1회 실행, PreToolUse(Bash) 훅.
#   - exit 0 + stderr  : 모델에 도달하지 않음 (마커 미관측)
#   - exit 0 + stdout JSON hookSpecificOutput.additionalContext : 모델에 도달
#     ("PreToolUse:Bash hook additional context: <text>" 형태로 모델이 인용)
#   따라서 additionalContext 로만 전달한다. 미측정: 대화형 세션, 다른 모델.
#
# 차단하지 않는다 (R021 advisory-first):
#   항상 exit 0. permissionDecision/decision 필드를 출력하지 않고 tool input도 수정하지 않는다.
#   fail-open: stdin이 객체가 아니거나 command 가 없거나 jq 가 없으면 조용히 exit 0.
#
# 환경변수 override:
#   OMCUSTOM_CD_ADVISOR=off — advisory 비활성화
#
# 알려진 한계 (documents … 테스트로 고정):
#   - `eval "cd x"`, `bash -c 'cd x'` 등 문자열 안의 cd 는 따옴표 안이라 감지하지 않는다.
#   - 셸 함수 본문 `f() { cd x; }` 의 cd 는 `)` 뒤라 명령 시작이 아니어서 감지하지 않는다
#     (`{ cd x; }` 그룹 자체는 감지한다).
#   - `case $x in a) cd x ;; esac` 의 case arm 안 cd 는 감지하지 않는다(`)` 뒤).
#   - 히어독 구분자 줄은 `<<[-]WORD` 의 WORD(따옴표 제거)와 일치하는 줄로 판정한다. 히어독 본문은
#     건너뛰지만, 큰따옴표 문자열 안의 `$( … <<EOF … )` 형태는 큰따옴표 구간을 통째로 불투명하게 취급한다.
#   - bash 로 실행되는 환경에서는 `ls | cd x` 가 cwd 를 바꾸지 않으나 zsh 기준으로 감지한다(위 참조).
#   - `command -p cd x` 처럼 옵션이 낀 접두 형태는 감지하지 않는다.

set -uo pipefail

[ "${OMCUSTOM_CD_ADVISOR:-}" = "off" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat) || exit 0
cmd=$(printf '%s' "$input" | jq -r 'if type == "object" then (.tool_input.command // "" | if type == "string" then . else "" end) else "" end' 2>/dev/null) || exit 0
[ -n "$cmd" ] || exit 0

# 사전 필터: cwd 변경 명령어 부분문자열이 없으면 스캔하지 않는다.
case "$cmd" in
  *cd*|*pushd*|*popd*) ;;
  *) exit 0 ;;
esac

# 선형 awk 스캐너: 따옴표 / 괄호 깊이(`(`, `$(` 포함) / 백틱 / 히어독 / 명령 시작 위치 / 구간 종결자 추적.
# 종료코드 0 = 지속 cd 발견. 입력은 stdin 단일 레코드(RS=\001)로 받는다.
# shellcheck disable=SC2016
AWK_PROG='
BEGIN { RS = "\001" }
{ s = s $0 }
function isdelim(c) { return (c == " " || c == "\t" || c == "\n" || c == ";" || c == "&" || c == "|" || c == "(" || c == ")" || c == "<" || c == ">" || c == "\"" || c == "\047" || c == "\\" || c == "`") }
function scan(   n, ch, i, c, nx, pv, q, depth, bt, start, assign, cand, arith, akind, sep, adv, j, w, hn, hd, hdash, k, line, dq, d, dash) {
  n = split(s, ch, "")
  q = ""; depth = 0; bt = 0; start = 1; assign = 0; cand = 0; arith = 0; hn = 0
  i = 1
  while (i <= n) {
    c = ch[i]
    if (q == "\047") { if (c == "\047") q = ""; i++; continue }
    if (q == "\"") {
      if (c == "\\") { i += 2; continue }
      if (c == "\"") q = ""
      i++; continue
    }
    if (c == "\\") { i += 2; start = 0; continue }
    if (c == "\047") { q = "\047"; start = 0; i++; continue }
    if (c == "\"") { q = "\""; start = 0; i++; continue }
    if (c == "`") { bt = 1 - bt; start = bt;  assign = 0; i++; continue }
    if (c == "(") { depth++; if (i > 1 && ch[i - 1] == "(") { akind[depth] = 1; arith++ } start = 1; assign = 0; i++; continue }
    if (c == ")") { if (akind[depth]) { akind[depth] = 0; arith-- } if (depth > 0) depth--; start = 0; assign = 0; i++; continue }
    if (c == " " || c == "\t") { if (assign) { start = 1; assign = 0 } i++; continue }
    if (c == "<") {
      nx = ch[i + 1]
      if (nx == "<") {
        if (ch[i + 2] == "<") { i += 3; start = 0; continue }
        if (arith > 0) { i += 2; start = 0; continue }
        i += 2; dash = 0
        if (ch[i] == "-") { dash = 1; i++ }
        while (i <= n && (ch[i] == " " || ch[i] == "\t")) i++
        dq = ""
        while (i <= n) {
          d = ch[i]
          if (d == "\047" || d == "\"" || d == "\\") { i++; continue }
          if (d == " " || d == "\t" || d == "\n" || d == ";" || d == "&" || d == "|" || d == "(" || d == ")" || d == "<" || d == ">") break
          dq = dq d; i++
        }
        hn++; hd[hn] = dq; hdash[hn] = dash
        start = 0; continue
      }
      start = 0; i++; continue
    }
    sep = ""; adv = 1
    if (c == ";" || c == "\n") sep = "term"
    else if (c == "|") {
      nx = ch[i + 1]
      if (nx == "|") { sep = "term"; adv = 2 }
      else if (nx == "&") { sep = "pipe"; adv = 2 }
      else sep = "pipe"
    } else if (c == "&") {
      nx = ch[i + 1]; pv = (i > 1) ? ch[i - 1] : ""
      if (nx == "&") { sep = "term"; adv = 2 }
      else if (pv == ">" || pv == "<" || nx == ">") { start = 0; i++; continue }
      else sep = "bg"
    }
    if (sep != "") {
      if (cand) { if (sep == "term") return 1; cand = 0 }
      start = 1; assign = 0
      i += adv
      if (c == "\n" && hn > 0) {
        for (k = 1; k <= hn; k++) {
          while (i <= n) {
            line = ""
            while (i <= n && ch[i] != "\n") { line = line ch[i]; i++ }
            i++
            if (hdash[k]) sub(/^\t+/, "", line)
            if (line == hd[k]) break
          }
        }
        hn = 0
      }
      continue
    }
    if (c == "#" && start == 1) {
      while (i <= n && ch[i] != "\n") i++
      continue
    }
    if (start == 1) {
      j = i; w = ""
      while (j <= n && !isdelim(ch[j])) { w = w ch[j]; j++ }
      if (j == i) { start = 0; i++; continue }
      if ((w == "cd" || w == "pushd" || w == "popd") && depth == 0 && bt == 0 && !cand) {
        cand = 1; start = 0; i = j; continue
      }
      if (w == "then" || w == "do" || w == "else" || w == "elif" || w == "if" || w == "while" || w == "until" || w == "time" || w == "builtin" || w == "command" || w == "!" || w == "{") {
        i = j; continue
      }
      if (w ~ /^[A-Za-z_][A-Za-z0-9_]*=/) { assign = 1; start = 0; i = j; continue }
      start = 0; i = j; continue
    }
    i++
  }
  return cand ? 1 : 0
}
END { exit (scan() ? 0 : 1) }
'

has_toplevel_cd() {
  printf '%s' "$1" | LC_ALL=C awk "$AWK_PROG" 2>/dev/null
}

if has_toplevel_cd "$cmd"; then
  advisory_text='[CD Advisory] 이 Bash 명령에는 서브셸 밖에 놓인 최상위 `cd`(또는 `pushd`/`popd`)가 있습니다. Bash 도구의 `cd`는 세션 cwd로 남아 이후 명령의 상대 경로를 어긋나게 합니다(`cd X && ( … )` 형태도 `cd`가 괄호 밖이므로 동일합니다). 절대 경로를 쓰거나 `( cd <dir> && … )`처럼 서브셸 안에서만 이동하십시오(R005). 이미 의도한 지속 이동이라면 이후 명령의 경로가 이를 전제하는지 확인하십시오.'
  jq -cn --arg ctx "$advisory_text" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}'
fi

exit 0
