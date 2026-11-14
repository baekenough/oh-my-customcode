#!/usr/bin/env bash
# context-pack-injector.sh — PreToolUse / SessionStart(compact): event-driven one-shot context injection (L2)
# (리뷰 R3-7) 상속된 셸 옵션(SHELLOPTS/BASHOPTS)을 가장 먼저 끈다 — xtrace 는 stderr 를 오염시키고 errexit 는 `--reset` 의
# 비어 있지 않은 `rmdir` 실패를 종료 코드로 바꾼다. 그룹의 stderr 를 버리는 이유: xtrace 가 켜져 있으면 이 명령 자체의 추적 줄이
# 출력된다. 상속된 verbose 는 끄기 전에 읽은 이 몇 줄을 stderr 에 에코하는 것까지는 막지 못한다. keyword(`set -k`)가 켜져 있으면
# `export LC_ALL=C` 가 `LC_ALL=C export` 로 읽혀 환경 전체가 stdout 에 덤프되므로 가장 먼저 끈다(리뷰 R4-1). onecmd 와 noexec 는
# 스크립트 안에서 되돌릴 수 없다 — 어느 쪽이든 훅은 출력 없이 rc 0 으로 끝난다(주입도 리셋도 하지 않는다; 테스트로 고정).
# 스크립트 자신의 옵션(`set -uo pipefail`)은 아래에서 설정한다. BASHOPTS 로 상속된 shopt 도 기본값으로 되돌린다(알 수 없는
# 옵션은 무시).
{ set +o allexport +o errexit +o keyword +o noclobber +o noglob +o nounset +o verbose +o xtrace; } 2>/dev/null
shopt -u dotglob extglob failglob nocaseglob nocasematch nullglob xpg_echo 2>/dev/null
#
# 역할 (v2.0.26, #1970):
#   규칙을 상시 core / `paths:` 경로 조건부 / 이벤트 주입 3계층으로 나눈 중 세 번째 계층.
#   특정 도구 호출 이벤트에서만 `.claude/contexts/<pack>.md` 본문을 additionalContext로 1회 주입한다.
#
# 사용:
#   context-pack-injector.sh delegation       PreToolUse(Agent|Task|SendMessage) — 항상 후보
#   context-pack-injector.sh commit-release   PreToolUse(Bash) — git commit/push, gh pr create/merge,
#                                             gh release, npm publish(npx npm publish 포함)가
#                                             명령 위치에 있을 때만 후보 (아래 「commit-release 판정」 참조)
#   context-pack-injector.sh --reset          SessionStart(compact) — 이 세션의 마커를 지워 재주입 허용
#
# 1회 판정: 마커 디렉터리 `${TMPDIR:-/tmp}/omcustom-ctxpack-<uid>/<session_id>/<pack>-<agent_id|main>`.
#   마커가 없을 때만 주입하고 `mkdir -m 700` 으로 원자적으로 선점한다(같은 메시지의 병렬 호출 중 1건만 주입).
#   마커를 파일이 아니라 디렉터리로 만드는 이유: mkdir 은 이미 있는 어떤 항목(심볼릭 링크·FIFO·/dev/null 링크)도
#   열거나 따라가지 않고 실패하므로 FIFO 에서 멈추거나 비정규 파일로 1회 보장이 깨지지 않는다.
#   베이스는 사용자별(`-<uid>`)이며 사용 전 항상 검사한다: 실제 디렉터리(`-d` 이고 `-L` 아님), 현재 사용자 소유(`-O`),
#   소유자 전용 모드(소유자 rwx, 그룹·기타 비트 0; sticky/setgid 는 무시), 확장 ACL 없음(`ls -ld` 11번째 문자 `+`) —
#   하나라도 어긋나면 fail-closed: 주입도 리셋도 하지 않고 대체 경로도 없이 exit 0 하며, 거부된 경로(제어문자는 `?` 로
#   치환)와 사유를 stderr 에 정확히 한 줄 남긴다(stdout 은 비운다). 세션 디렉터리도 같다. 베이스가 아직 없는 `--reset`
#   은 정상 상태이므로 무음이다.
#   키는 hook stdin의 session_id 와 agent_id(없으면 main) — 서브에이전트는 자기 컨텍스트가 따로이므로 별도 주입.
#   session_id/agent_id 는 문자열이고 `[A-Za-z0-9_-]{1,128}` 만 허용(경로 구성 요소 보호). 존재하지만 문자열이 아닌
#   agent_id(null, 빈 값, 숫자, 배열, 객체), 제어문자·개행을 포함한 값, JSON 문서가 둘 이상인 stdin 은 정규화하지 않고
#   거부한다 — 아니면 무음 exit 0.
#   빠른 경로: 마커가 이미 있으면(같은 세션·에이전트) 명령 스캔·팩 읽기 전에 곧바로 exit 0.
#
# 주입 형식: {"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"…"}}
#   본문 앞 1줄 머리말(합쇼체): PreToolUse 는 호출이 작성된 뒤 발화하므로 방금 호출에도 적용되며
#   누락이 있으면 후속 메시지로 보완하라는 취지. 본문은 HTML 주석(`<!-- … -->`, 여러 줄)을 제거한 텍스트.
#   닫히지 않은 `<!--` 는 그 지점부터 끝까지 버린다(주석이 컨텍스트로 새지 않도록).
#
# 차단하지 않는다 (R021 advisory-first):
#   항상 exit 0. `permissionDecision`/`decision` 필드를 내지 않고 tool input 도 수정하지 않는다 —
#   2.1.323 CHANGELOG: "Changed what happens when a tool's permission check fails with an error after a
#   `PreToolUse` hook returned \"allow\": Claude Code now decides the call as if no hook had answered".
#   무음 exit 0: jq 부재, stdin 이 단일 JSON 객체가 아님/파싱 실패, 팩 이름 불량, 팩 파일 부재, 빈 본문,
#   잘못된 session_id/agent_id, OMCUSTOM_CONTEXT_PACKS=off.
#   안전하지 않은 마커 베이스·세션 디렉터리는 exit 0 이되 stderr 한 줄 경고(위 참조)를 남긴다.
#   크기 상한: 머리말을 포함한 주입문이 9,153자를 넘으면 주입하지 않고 stderr 에 한 줄 경고(파일 경로 — 제어문자는 `?` 로
#   치환 — 와 크기)만 낸다. 센 단위는 UTF-16 코드 단위다(U+FFFF 를 넘는 코드포인트는 2). CC 가 길이를 세는 정확한 단위는
#   미실측이고 UTF-16 단위는 코드포인트 수보다 작지 않으므로, 훅은 더 보수적인 쪽으로 센다(실제 팩에는 U+FFFF 초과 문자가 없어
#   코드포인트 수와 같다; jq 1.8.1 은 U+FFFF 초과 문자가 많은 입력의 길이를 조금 높게 보고할 수 있으며 그 방향은 보수적이다). 9,153 은 CC 2.1.325 에서 "통째로 전달됨"을 실측한 가장 큰 주입문 크기이고, 10,653자는
#   "Output too large (10.4KB)" 로 처리되어 앞 약 2KB 미리보기만 모델에 들어갔다. 그 사이 경계는 미실측이므로(인라인
#   한도 약 10,000자는 [가설]) 실측된 값을 상한으로 쓴다 — 잘린 주입이 마커만 소비하는 일을 막는다. 마커는 선점하지 않는다.
#   테스트(`context-pack-injector.test.ts` 의 INJECT_CAP)도 같은 값을 쓴다 — 올리려면 새 실측과 함께 둘을 같이 올린다.
#   배선: hooks.json 의 세 항목에 `"timeout": 5`(초)를 둔다 — 훅이 멈춰도 호출당 5초를 넘기지 않는다.
#
# 팩 파일 위치: 이 저장소에서 `.claude/contexts/` 는 gitignore(`.gitignore:40` `.claude/*`)이고 정본은
#   `templates/.claude/contexts/` 이다 — 새 clone 에서는 팩이 없어 이 훅이 무음 통과한다(`omcustom init` 이후에야 존재).
#
# commit-release 판정 — 계약:
#   이 매처는 셸 파서가 아니라 토큰 수준 휴리스틱이다(awk 단일 패스, LC_ALL=C). 문서화된 트리거 집합은 `git commit`,
#   `git push`, `gh pr create`, `gh pr merge`, `gh release`, `npm publish` 여섯 가지(CLAUDE.md 「규칙 로딩」)뿐이며,
#   그 안에서도 명령을 놓칠 수 있고(미탐) 실행되지 않는 단어에 맞을 수도 있다(오탐). 미탐이든 오탐이든 한 건의 비용은
#   자문(advisory) 주입 1회가 빠지거나 1회 더 나가는 것뿐이고 그 밖의 효과는 없다(항상 exit 0, 결정 필드 없음).
#   미탐 예(예시일 뿐 전수 목록이 아니다):
#     - 히어독·히어스트링이 명령 앞에 오는 형태: `<<EOF git push`, `<<<x git push`
#     - 모델링하지 않은 래퍼·도구 옵션: `sudo -iu bot git push`, `timeout --kill-after 5 60 git push`,
#       `env --chdir /x git push`, `npm --tag x publish`, `npm --otp 123456 publish`
#     - 문자열로 평가되는 명령: `env -S 'git push'`, `bash -c 'git commit'`, `eval "git push"`
#     - 버전이 붙은 `npx npm@latest publish`
#     - `case x in a) git push ;; esac` 의 arm 안, `xargs`/`nice`/`coproc` 뒤, `$(which git) push`, `g\it push`
#     - 앞 32,768바이트 뒤에 놓인 명령, 큰따옴표 안의 `$( … )`
#   오탐 예(예시): 배열 리터럴 `cmds=(git push)`, ANSI-C 문자열 `$'it\'s; git push'` 안의 `\'` 이후,
#     실행하지 않는 `sudo -l git push`.
#   패키지 매니저: `pnpm publish`, `bun publish`, `yarn npm publish` 가 맞는 것은 이전 구현과의 하위 호환을 위해 남겨
#     둔 것이며 보장이 아니다. `yarn publish`, `pnpm --filter x publish` 는 범위 밖이다.
#   테스트(`context-pack-injector.test.ts`)는 위 예 중 일부와 아래 동작만 고정한다.
#
#   동작(요약): .claude/hooks/scripts/bash-cd-advisor.sh 의 명령 위치 스캐너(따옴표 / 괄호 / 백틱 / 히어독 추적)를
#   기반으로 하며 hooks.json 의 dev-server 판정(따옴표 제거 후 명령 위치 grep)과 같은 원칙이되, git 전역 옵션
#   (`git -C dir commit`, `git -c k=v push`)과 gh 의 `-R`/`--repo` 값을 건너뛰기 위해 단어 단위로 읽는다.
#   명령 시작 위치 = 문장 처음, `&&` `||` `;` 개행 `|` `&` `(` 뒤, 접두 키워드(`then` `do` `else` `elif` `if` `while`
#   `until` `time` `builtin` `command` `exec` `env` `sudo` `nohup` `timeout` `!` `{`)와 선행 `VAR=value`, 선행
#   리다이렉션(`2>/dev/null git push`, `&>log git push`, `<in git commit`) 뒤. 접두 키워드 뒤의 옵션 일부는 건너뛴다:
#   `timeout [-k D] [-s SIG] DURATION`, `time -p`, `sudo [-u USER | --user USER | -g GROUP …]`, `env [-u NAME]`,
#   `command -p`. `command -v`/`-V` 는 조회일 뿐 실행이 아니므로 그 뒤 단어는 명령이 아니다. `npx [옵션] npm publish`
#   도 맞는다. 따옴표 문자열 / 히어독 본문 / 주석 안의 언급은 제외한다.
#   스캔 입력은 앞 32,768바이트까지만 본다(MAX_SCAN_BYTES). 잘렸을 때는 창 끝에 닿은 마지막 토큰을 버린다
#   (`git pushover` 가 `git push` 로 잘려 맞는 오탐 방지; 백슬래시-개행 이음은 토큰의 일부로 본다). 스캐너의
#   단어·히어독 줄 누적은 입력 길이에 대해 초선형이라(측정: 단일 단어 1MB 약 37초) 입력을 먼저 자른다.
#
# 그 밖의 알려진 한계:
#   - `--reset` 은 그 세션의 모든 에이전트 마커를 지우므로 compact 되지 않은 서브에이전트도 팩을 다시 받는다.
#     서브에이전트 자신의 compact 는 리셋을 일으키지 않는다. 마커 디렉터리는 TMPDIR 정리에만 맡긴다(세션당 1개 남음).
#   (리뷰 F4/R3-2) 마커는 출력 전에 선점한다. stdout 쓰기가 실패하면(닫힌 stdout, 읽는 쪽이 사라진 파이프; SIGPIPE 는
#     무시한다) 마커를 되돌리고 exit 0 한다. 쓰기는 성공했지만 호출이 이후 권한 프롬프트나 다른 훅에 의해 거부될 때 CC 가
#     additionalContext 를 그래도 전달하는지는 미확인이고, 그때는 다음 compact 까지 팩을 받지 못한다.
#   (리뷰 F7) 팩 조회는 CLAUDE_PROJECT_DIR 이 비면 훅의 cwd 아래 `./.claude/contexts/` 로 폴백하고 심볼릭 링크를
#     따라간다. 팩은 CLAUDE.md 와 같은 신뢰 수준(훅 권한으로 주입)이므로 `.claude/contexts/*.md` 변경을
#     CLAUDE.md 변경처럼 검토한다.
#   (리뷰 F8) 팩에 NUL 바이트가 있으면 그 뒤가 버려지고 `\001` 은 레코드 구분자라 버려진다. 다른 C0 제어문자는
#     JSON 이스케이프되어 그대로 들어간다. 중첩된 `<!--` 는 HTML 의미대로 처리한다(첫 `-->` 에서 닫힘).
#   (리뷰 R3-7, R4-1) `SHELLOPTS`/`BASHOPTS` 로 상속된 셸 옵션 중 allexport, errexit, keyword, noclobber, noglob, nounset,
#     verbose, xtrace 와 glob 관련 shopt 는 스크립트 첫 줄에서 끈다. `onecmd`/`noexec` 는 되돌릴 수 없어 훅이 출력 없이 rc 0 으로
#     끝난다(주입도 리셋도 하지 않음). 스크립트 시작 전에 실행되는 `BASH_ENV` 와 위 목록 밖의 옵션은 막지 않는다 — 아래 신뢰 모델.
#
# 신뢰 모델 (리뷰 R4-6, R4-7):
#   훅은 자기 프로세스 환경을 PATH 와 같은 수준으로 신뢰한다. PATH 의 `id`/`find`/`ls`/`jq`/`awk`/`tr` 을 바꾸거나 환경으로 상속된
#   셸 함수(`BASH_FUNC_*`; `command id` 는 `id` 함수만 건너뛴다), `BASH_ENV`, 위에서 끄지 않는 옵션을 조작할 수 있는 쪽은 훅
#   자체도 바꿀 수 있으므로 이를 방어하지 않는다. 방어 대상은 같은 머신의 다른 사용자(베이스 디렉터리 검증)와 입력 데이터
#   (stdin, 명령 문자열, 팩 파일, 경로 문자열)이다. `clean_path` 는 C0 제어문자와 DEL 만 `?` 로 바꾸므로 C1 제어문자와 그 밖의
#   유니코드 제어문자(U+0085, U+009B, U+2028 등)는 그대로 출력되지만 줄은 하나로 유지된다.
#
# 환경변수 override:
#   OMCUSTOM_CONTEXT_PACKS=off — 주입/리셋 비활성화
#   CLAUDE_PROJECT_DIR         — 팩 파일 위치 기준(없으면 `.`)

set -uo pipefail
# (리뷰 R3-2) stdout 의 읽는 쪽이 사라져도 SIGPIPE 로 죽지 않는다(항상 exit 0). 쓰기 실패는 마지막 printf 에서 처리한다.
trap '' PIPE
export LC_ALL=C
umask 077

[ "${OMCUSTOM_CONTEXT_PACKS:-}" = "off" ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

mode="${1:-}"
case "$mode" in
  delegation | commit-release | --reset) ;;
  *) exit 0 ;;
esac

MAX_INJECT_CHARS=9153
MAX_SCAN_BYTES=32768

input=$(cat) || exit 0

# stdin 은 정확히 JSON 문서 1개(객체)여야 한다. session_id/agent_id 는 jq 안에서 검증하므로 이후 셸 치환이
# 값을 바꿀 수 없다(개행·NUL 제거로 서로 다른 ID 가 합쳐지는 일이 없다). agent_id 가 없으면 main,
# 있는데 문자열이 아니거나 형식이 틀리면 거부한다. 출력: 첫 줄 session_id, 둘째 줄 agent_id.
IDS_PROG='
def okid: type == "string" and length >= 1 and length <= 128
  and (explode | all(.[]; (. >= 48 and . <= 57) or (. >= 65 and . <= 90) or (. >= 97 and . <= 122) or . == 95 or . == 45));
[inputs] | select(length == 1) | .[0] | select(type == "object")
| select(.session_id | okid)
| (if has("agent_id") then .agent_id else "main" end) as $a
| select($a | okid)
| .session_id, $a
'
# (리뷰 R4-2) 파이프 왼쪽 printf 의 stderr 도 버린다: SIGPIPE 를 무시하므로(아래 trap) jq 가 입력을 다 읽기 전에 끝나면(예: 앞쪽이
# 깨진 140KiB 이상의 stdin) printf 가 EPIPE 를 "write error" 로 보고한다.
ids=$(printf '%s' "$input" 2>/dev/null | jq -n -r "$IDS_PROG" 2>/dev/null) || exit 0
case "$ids" in
  *$'\n'*) ;;
  *) exit 0 ;;
esac
sid=${ids%%$'\n'*}
agent=${ids#*$'\n'}

# 경로 구성 요소로 쓰이므로 [A-Za-z0-9_-] 만, 길이 128 이하(jq 검증의 이중 확인).
safe_component() {
  case "$1" in
    '' | *[!A-Za-z0-9_-]*) return 1 ;;
  esac
  [ "${#1}" -le 128 ]
}
safe_component "$sid" || exit 0
safe_component "$agent" || exit 0

# (리뷰 N1, R3-9) uid 는 항상 `id -u` 에서 얻는다. bash 3.2 는 환경에서 넘어온 UID/EUID 를 그대로 받아들이므로
# `$UID`/`$EUID` 는 쓰지 않는다 — 이 환경변수들은 베이스 이름을 정하지 못한다. `command` 는 `id` 이름의 상속된 셸 함수
# (`BASH_FUNC_id%%`) 하나만 건너뛴다; 다른 상속 함수·PATH 에 대한 신뢰는 그대로다(헤더의 신뢰 모델 참조).
# `id` 실패 시 무음 exit 0.
uid=$(command id -u 2>/dev/null) || exit 0
case "$uid" in
  '' | *[!0-9]*) exit 0 ;;
esac

base="${TMPDIR:-/tmp}/omcustom-ctxpack-$uid"
dir="$base/$sid"

# 실제 디렉터리(심볼릭 링크 아님) + 현재 사용자 소유.
own_dir() {
  [ -d "$1" ] && [ ! -L "$1" ] && [ -O "$1" ]
}
# own_dir + 소유자 전용 모드 + ACL 없음. 소유자 전용 모드: 소유자 rwx 가 있고 그룹·기타 비트가 모두 0 (sticky/setgid/setuid 는 무시).
# (리뷰 N3) 이식 형태: `find -maxdepth 0 -type d -perm -0700 ! -perm -0010 …` — `-perm -MODE`("MODE 의 비트가 모두 켜짐")는
# POSIX 형식이라 BSD/GNU 가 같게 동작하고, 비트별 부정(`!`)으로 "그 비트가 꺼짐"을 얻는다. `-perm /MODE`·`-perm +MODE` 는
# BSD/GNU 의미가 달라 쓰지 않고, `stat -c`(GNU)/`stat -f`(BSD)는 플래그가 달라 쓰지 않는다. find 는 기본(-P)으로 링크를
# 따라가지 않는다. 정확 일치(`-perm 0700`)는 Linux 에서 부모의 setgid 를 상속한 2700 이나 1700 을 영구 거부해 쓰지 않는다.
mode_ok() {
  [ -n "$(find "$1" -maxdepth 0 -type d -perm -0700 \
    ! -perm -0010 ! -perm -0020 ! -perm -0040 ! -perm -0001 ! -perm -0002 ! -perm -0004 2>/dev/null)" ]
}
# (리뷰 R3-1) 확장 ACL 은 모드 비트와 무관하게 접근을 열 수 있다(macOS: `drwx------` 인데 everyone 에게 delete_child 허용).
# `command ls -ld` 모드 문자열의 11번째 문자가 `+` 면 ACL 이 있다고 본다. `@`(macOS 확장 속성)와 `.`(GNU SELinux 컨텍스트)는
# ACL 이 아니다. 다만 macOS 의 `ls` 는 확장 속성이 있으면 ACL 이 있어도 `@` 만 표시하므로, `@` 일 때는 `ls -lde` 의 ACL 항목
# 줄(`N: …`)을 추가로 센다(GNU ls 는 `-e` 가 없어 출력이 비고, 그 경우 ACL 없음으로 본다).
# 반환: 0 = ACL 있음, 1 = 없음, 2 = 확인 불가(`ls` 가 없거나 실패). Linux 에서는 기본 ACL 이 있는 TMPDIR 안의 새 디렉터리도
# `+` 로 표시되어 거부된다 — 마스크가 `---` 라 안전하더라도 fail-closed 로 둔다.
has_acl() {
  local ms n
  ms=$(command ls -ld "$1" 2>/dev/null) || return 2
  ms=${ms%% *}
  case "$ms" in
    d?????????*) ;;
    *) return 2 ;;
  esac
  case "${ms:10:1}" in
    '+') return 0 ;;
    '@')
      n=$(command ls -lde "$1" 2>/dev/null | awk 'NR > 1 && $1 ~ /^[0-9]+:$/ { n++ } END { print n + 0 }' 2>/dev/null)
      case "$n" in
        '' | *[!0-9]*) return 2 ;;
      esac
      [ "$n" -gt 0 ] && return 0
      ;;
  esac
  return 1
}
secure_dir() {
  own_dir "$1" && mode_ok "$1" || return 1
  has_acl "$1"
  [ $? -eq 1 ]
}
# (리뷰 R3-6, R4-5, R4-7) 출력할 경로의 C0 제어문자(개행 포함)와 DEL 을 `?` 로 바꿔 한 줄을 유지한다. `tr` 은 입력 길이에 선형이다
# (bash 문자 단위 루프와 `${s//[[:cntrl:]]/?}` 는 둘 다 이차식: 16,000자에 1.6초~14초). C1 제어문자(0x80-0x9f)와 그 밖의 유니코드
# 제어문자는 UTF-8 연속 바이트와 겹치므로 그대로 통과한다 — 줄이 하나라는 보장은 `\n` 치환으로 유지된다. `tr` 이 없으면 경로 대신
# 고정 문구를 낸다(여전히 한 줄).
clean_path() {
  local out
  out=$(printf '%s' "$1" 2>/dev/null | tr '\000-\037\177' '?' 2>/dev/null) || out='(path hidden: tr is unavailable)'
  printf '%s' "$out"
}
# (리뷰 N2, R3-6) 거부 사유 한 구절. 호출 전에 secure_dir 가 실패한 경로에만 쓴다.
refusal_reason() {
  local rc
  if [ -L "$1" ]; then
    printf 'is a symbolic link'
  elif [ ! -e "$1" ]; then
    printf 'does not exist and could not be created'
  elif [ ! -d "$1" ]; then
    printf 'is not a directory'
  elif [ ! -O "$1" ]; then
    printf 'is not owned by the current user'
  elif ! command -v find >/dev/null 2>&1; then
    printf 'mode cannot be verified (find is unavailable)'
  elif ! mode_ok "$1"; then
    printf 'has a mode other than owner-only (group/other permission bits set or owner rwx missing)'
  else
    has_acl "$1"
    rc=$?
    if [ "$rc" -eq 0 ]; then
      printf 'carries an extended ACL'
    elif [ "$rc" -eq 2 ]; then
      printf 'ACL state cannot be verified (ls is unavailable or failed)'
    else
      printf 'could not be verified as owner-only'
    fi
  fi
}
# 거부된 경로를 stderr 에 정확히 한 줄로 알린다(stdout 은 건드리지 않는다; 호출자는 이어서 exit 0).
# $2 = 건너뛴 동작 설명(`context pack not injected` / `marker reset skipped`).
report_refusal() {
  printf '[context-pack-injector] refused: %s %s; %s (fail-closed)\n' \
    "$(clean_path "$1")" "$(refusal_reason "$1")" "$2" >&2
}
# 있으면 검증하고 없으면 만든다. 거부되면 한 줄 보고 후 실패.
ensure_dir() {
  mkdir -m 700 "$1" 2>/dev/null
  secure_dir "$1" && return 0
  report_refusal "$1" 'context pack not injected'
  return 1
}
# --reset 용: 경로가 없으면 무음(주입이 아직 없었던 정상 상태), 있는데 거부되면 한 줄 보고 후 실패.
check_existing_dir() {
  secure_dir "$1" && return 0
  if [ -e "$1" ] || [ -L "$1" ]; then
    report_refusal "$1" 'marker reset skipped'
  fi
  return 1
}

# ── --reset: 이 세션 디렉터리 안의 마커 디렉터리만, 이름을 검증해 하나씩 rmdir 한다 ─────────────
if [ "$mode" = "--reset" ]; then
  check_existing_dir "$base" || exit 0
  check_existing_dir "$dir" || exit 0
  for f in "$dir"/*; do
    name=${f##*/}
    case "$name" in
      delegation-* | commit-release-*) ;;
      *) continue ;;
    esac
    case "$name" in
      *[!A-Za-z0-9_-]*) continue ;;
    esac
    # 내가 소유한 실제 디렉터리 마커만(링크·FIFO·파일은 건드리지 않는다). rmdir 은 빈 디렉터리만 지운다.
    if own_dir "$f"; then
      rmdir -- "$f" 2>/dev/null
    fi
  done
  rmdir "$dir" 2>/dev/null
  exit 0
fi

pack="$mode"
marker="$dir/$pack-$agent"

# 빠른 경로: 이 세션·에이전트에 이미 주입했다면 명령 스캔·팩 읽기 전에 끝낸다.
if own_dir "$base" && own_dir "$dir" && own_dir "$marker"; then
  exit 0
fi

# ── commit-release: 명령 위치 스캐너 ────────────────────────────────────────────────────────
read -r -d '' AWK_PROG <<'AWK' || true
BEGIN { RS = "\001" }
{ s = s $0 }
function isdelim(c) { return (c == " " || c == "\t" || c == "\n" || c == ";" || c == "&" || c == "|" || c == "(" || c == ")" || c == "<" || c == ">") }
function skipws() {
  while (P <= N) {
    if (ch[P] == " " || ch[P] == "\t") P++
    else if (ch[P] == "\\" && ch[P + 1] == "\n") P += 2
    else break
  }
}
# 따옴표를 벗긴 단어 하나를 읽어 W 에 담고 P 를 구분자 앞으로 옮긴다.
function readword(   c, q, w) {
  q = ""; w = ""
  while (P <= N) {
    c = ch[P]
    if (q == "'") { if (c == "'") q = ""; else w = w c; P++; continue }
    if (q == "\"") {
      if (c == "\\" && P < N) { w = w ch[P + 1]; P += 2; continue }
      if (c == "\"") q = ""; else w = w c
      P++; continue
    }
    if (c == "\\") { if (P < N && ch[P + 1] != "\n") w = w ch[P + 1]; P += 2; continue }
    if (c == "'") { q = "'"; P++; continue }
    if (c == "\"") { q = "\""; P++; continue }
    if (isdelim(c)) break
    w = w c; P++
  }
  W = w
}
# `-` 로 시작하지 않는 다음 단어(없으면 빈 문자열)
function nextplain(   p0) {
  while (1) {
    skipws()
    if (P > N || isdelim(ch[P])) return ""
    p0 = P; readword()
    if (P == p0) return ""
    if (substr(W, 1, 1) != "-") return W
  }
}
# gh 용: -R/--repo 의 값을 건너뛰고 `-` 로 시작하지 않는 다음 단어
function nextplain_gh(   p0) {
  while (1) {
    skipws()
    if (P > N || isdelim(ch[P])) return ""
    p0 = P; readword()
    if (P == p0) return ""
    if (W == "-R" || W == "--repo") {
      skipws()
      if (P > N || isdelim(ch[P])) return ""
      readword(); continue
    }
    if (substr(W, 1, 1) != "-") return W
  }
}
function git_hit(   w, p0) {
  while (1) {
    skipws()
    if (P > N || isdelim(ch[P])) return 0
    p0 = P; readword(); w = W
    if (P == p0) return 0
    if (w == "-C" || w == "-c" || w == "--git-dir" || w == "--work-tree" || w == "--namespace") {
      skipws()
      if (P > N || isdelim(ch[P])) return 0
      readword(); continue
    }
    if (substr(w, 1, 1) == "-") continue
    return (w == "commit" || w == "push") ? 1 : 0
  }
}
function gh_hit(   w1, w2) {
  w1 = nextplain_gh()
  if (w1 == "release") return 1
  if (w1 == "pr") { w2 = nextplain_gh(); return (w2 == "create" || w2 == "merge") ? 1 : 0 }
  return 0
}
function pub_hit() { return (nextplain() == "publish") ? 1 : 0 }
function yarn_hit() { return (nextplain() == "npm" && nextplain() == "publish") ? 1 : 0 }
function npx_hit(   w) {
  skipopts(" -p --package -w --workspace --registry --cache --userconfig -c --call ")
  skipws()
  if (P > N || isdelim(ch[P])) return 0
  readword(); w = W; sub(/^.*\//, "", w)
  return (w == "npm") ? pub_hit() : 0
}
function isprefix(w) {
  return (w == "then" || w == "do" || w == "else" || w == "elif" || w == "if" || w == "while" || w == "until" || w == "time" || w == "builtin" || w == "command" || w == "exec" || w == "env" || w == "sudo" || w == "nohup" || w == "timeout" || w == "!" || w == "{")
}
# `-` 로 시작하는 옵션 단어를 건너뛴다. valued 에 " 옵션 " 형태로 나열된 옵션은 값 단어도 건너뛴다.
# 옵션이 아닌 단어를 만나면 되돌려 놓고(P = p0) 끝낸다.
function skipopts(valued,   p0, o) {
  while (1) {
    skipws()
    if (P > N || isdelim(ch[P])) return
    p0 = P; readword(); o = W
    if (P == p0) return
    if (substr(o, 1, 1) != "-") { P = p0; return }
    if (o == "--") return
    if (index(valued, " " o " ") > 0) {
      skipws()
      if (P > N || isdelim(ch[P])) return
      readword()
    }
  }
}
# `command` 의 옵션을 건너뛴다. -v / -V (묶음 포함: -pv) 가 있으면 조회일 뿐 실행이 아니므로 1, 아니면 0.
function skipcmdopts(   p0, o, q) {
  q = 0
  while (1) {
    skipws()
    if (P > N || isdelim(ch[P])) return q
    p0 = P; readword(); o = W
    if (P == p0) return q
    if (substr(o, 1, 1) != "-") { P = p0; return q }
    if (o == "--") return q
    if (o ~ /^-[A-Za-z]*[vV]/) q = 1
  }
}
# 접두 단어 뒤의 옵션(과 timeout 의 DURATION)을 건너뛴다. 명령 위치는 유지된다.
# 반환 1 = 이 접두 단어가 명령을 실행하지 않는 조회 형태(`command -v`): 호출자가 명령 위치를 닫는다.
function skipprefix(w) {
  if (w == "timeout") {
    skipopts(" -k -s ")
    skipws()
    if (P <= N && !isdelim(ch[P])) readword()
    return 0
  }
  if (w == "sudo") {
    skipopts(" -u -g -C -D -h -p -r -t -T -U -R --user --group --chdir --chroot --host --prompt --role --type --other-user --close-from --command-timeout ")
    return 0
  }
  if (w == "env") { skipopts(" -u -C -S "); return 0 }
  if (w == "exec") { skipopts(" -a "); return 0 }
  if (w == "command") return skipcmdopts()
  if (w == "time" || w == "builtin" || w == "nohup") { skipopts(" "); return 0 }
  return 0
}
# P 가 `>` 또는 `<` 에 있을 때 리다이렉션 연산자와 대상 단어를 소비한다(명령 위치는 유지).
function redirect() {
  P++
  if (ch[P] == ">" || ch[P] == "|") P++
  else if (ch[P] == "&") P++
  skipws()
  if (P <= N && !isdelim(ch[P])) readword()
}
function scan(   c, nx, pv, q, start, bt, hn, hd, hdash, dash, dq, d, k, line, w, base, hit, p0, depth, akind, arith) {
  N = split(s, ch, "")
  P = 1; q = ""; start = 1; bt = 0; hn = 0; depth = 0; arith = 0
  while (P <= N) {
    c = ch[P]
    pv = (P > 1) ? ch[P - 1] : ""
    if (q == "'") { if (c == "'") q = ""; P++; continue }
    if (q == "\"") {
      if (c == "\\") { P += 2; continue }
      if (c == "\"") q = ""
      P++; continue
    }
    if (c == " " || c == "\t") { P++; continue }
    if (c == "\\" && ch[P + 1] == "\n") { P += 2; continue }
    if (c == "#" && (pv == "" || pv == " " || pv == "\t" || pv == "\n" || pv == ";" || pv == "|" || pv == "&" || pv == "(")) {
      while (P <= N && ch[P] != "\n") P++
      continue
    }
    if (c == ";" || c == "\n") {
      P++; start = 1
      if (c == "\n" && hn > 0) {
        for (k = 1; k <= hn; k++) {
          while (P <= N) {
            line = ""
            while (P <= N && ch[P] != "\n") { line = line ch[P]; P++ }
            P++
            if (hdash[k]) sub(/^\t+/, "", line)
            if (line == hd[k]) break
          }
        }
        hn = 0
      }
      continue
    }
    if (c == "|") { P++; if (ch[P] == "|" || ch[P] == "&") P++; start = 1; continue }
    if (c == "&") {
      nx = ch[P + 1]
      if (nx == "&") { P += 2; start = 1; continue }
      if (nx == ">" && start == 1) { P++; continue }
      if (pv == ">" || pv == "<" || nx == ">") { P++; start = 0; continue }
      P++; start = 1; continue
    }
    if (c == "(") { depth++; if (pv == "(") { akind[depth] = 1; arith++ } P++; start = 1; continue }
    if (c == ")") { if (akind[depth]) { akind[depth] = 0; arith-- } if (depth > 0) depth--; P++; start = 0; continue }
    if (c == "`") { bt = 1 - bt; start = bt; P++; continue }
    if (c == ">") {
      if (start == 1) { redirect(); continue }
      P++; start = 0; continue
    }
    if (c == "<") {
      nx = ch[P + 1]
      if (nx == "<") {
        if (ch[P + 2] == "<") { P += 3; start = 0; continue }
        if (arith > 0) { P += 2; start = 0; continue }
        P += 2; dash = 0
        if (ch[P] == "-") { dash = 1; P++ }
        while (P <= N && (ch[P] == " " || ch[P] == "\t")) P++
        dq = ""
        while (P <= N) {
          d = ch[P]
          if (d == "'" || d == "\"" || d == "\\") { P++; continue }
          if (isdelim(d)) break
          dq = dq d; P++
        }
        hn++; hd[hn] = dq; hdash[hn] = dash
        start = 0; continue
      }
      if (start == 1) { redirect(); continue }
      P++; start = 0; continue
    }
    if (start == 1) {
      p0 = P; readword(); w = W
      if (P == p0) { P++; start = 0; continue }
      if (w ~ /^[0-9]+$/ && (ch[P] == ">" || ch[P] == "<")) continue
      if (isprefix(w)) { if (skipprefix(w)) start = 0; continue }
      if (w ~ /^[A-Za-z_][A-Za-z0-9_]*=/) continue
      base = w; sub(/^.*\//, "", base)
      hit = 0
      if (base == "git") hit = git_hit()
      else if (base == "gh") hit = gh_hit()
      else if (base == "npm" || base == "pnpm" || base == "bun") hit = pub_hit()
      else if (base == "yarn") hit = yarn_hit()
      else if (base == "npx") hit = npx_hit()
      if (hit) return 1
      start = 0; continue
    }
    if (c == "'") { q = "'"; P++; continue }
    if (c == "\"") { q = "\""; P++; continue }
    if (c == "\\") { P += 2; continue }
    P++
  }
  return 0
}
END { exit (scan() ? 0 : 1) }
AWK

has_release_command() {
  printf '%s' "$1" 2>/dev/null | awk "$AWK_PROG" 2>/dev/null
}

if [ "$pack" = "commit-release" ]; then
  cmd=$(printf '%s' "$input" 2>/dev/null | jq -r '.tool_input.command // "" | if type == "string" then . else "" end' 2>/dev/null) || exit 0
  [ -n "$cmd" ] || exit 0
  # 스캔 입력 상한(바이트; LC_ALL=C). 이보다 뒤에 놓인 명령은 감지하지 않는다.
  # (리뷰 N4b) 잘린 경우 창 끝에 닿은 마지막 토큰(`git pushover` 가 `git push` 로 잘린 것)은 버린다 —
  # 마지막 구분자 뒤의 꼬리를 제거한다. 구분자가 하나도 없으면 전체가 한 토큰이므로 빈 문자열이 된다.
  # (awk 로 뒤에서부터 센다: bash 3.2 의 `${cmd##*[…]}` 는 구분자 없는 32KB 단어에서 60초 넘게 걸린다 — 측정.)
  if [ "${#cmd}" -gt "$MAX_SCAN_BYTES" ]; then
    cmd=${cmd:0:$MAX_SCAN_BYTES}
    cmd=$(printf '%s' "$cmd" 2>/dev/null | awk '
      BEGIN { RS = "\001" }
      { s = s $0 }
      END {
        n = length(s)
        # (리뷰 R3-3) 백슬래시 바로 뒤의 개행은 줄 이음이라 토큰의 일부다.
        while (n > 0 && (index(" \t\n;&|()<>", substr(s, n, 1)) == 0 || (substr(s, n, 1) == "\n" && substr(s, n - 1, 1) == "\\"))) n--
        printf "%s", substr(s, 1, n)
      }' 2>/dev/null) || exit 0
    [ -n "$cmd" ] || exit 0
  fi
  # 사전 필터: 대상 프로그램 이름 부분문자열이 없으면 스캔하지 않는다.
  case "$cmd" in
    *git* | *gh* | *npm* | *bun* | *yarn*) ;;
    *) exit 0 ;;
  esac
  has_release_command "$cmd" || exit 0
fi

# ── 팩 본문: HTML 주석 제거 + 앞뒤 공백 trim ─────────────────────────────────────────────────
file="${CLAUDE_PROJECT_DIR:-.}/.claude/contexts/$pack.md"
[ -f "$file" ] && [ -r "$file" ] || exit 0

strip_comments() {
  awk '
    BEGIN { RS = "\001" }
    { s = s $0 }
    END {
      out = ""
      while ((i = index(s, "<!--")) > 0) {
        out = out substr(s, 1, i - 1)
        rest = substr(s, i + 4)
        j = index(rest, "-->")
        if (j == 0) { s = ""; break }
        s = substr(rest, j + 3)
      }
      out = out s
      sub(/^[ \t\r\n]+/, "", out)
      sub(/[ \t\r\n]+$/, "", out)
      printf "%s", out
    }
  ' "$file" 2>/dev/null
}

body=$(strip_comments) || exit 0
[ -n "$body" ] || exit 0

preamble="[Context Pack: ${pack}] 이 규약은 방금 보낸 호출에도 적용됩니다. PreToolUse 훅은 호출이 작성된 뒤 발화하므로, 방금 호출에서 아래 규약이 누락되었다면 후속 메시지로 보완하십시오. 이 팩은 세션(에이전트별)당 한 번만 주입됩니다."
ctx="${preamble}

${body}"

# 크기 상한은 머리말을 포함한 주입문 전체 기준이고 UTF-16 코드 단위로 센다(U+FFFF 를 넘는 코드포인트는 2) — CC 가 주입문 길이를
# 세는 단위는 미실측이며 UTF-16 단위는 코드포인트 수보다 작지 않아 더 보수적이다(리뷰 R4-4). 초과하면 주입하지 않고 stderr 에 한 줄
# 경고만 낸다(stderr 는 모델에 도달하지 않는다). 마커는 선점하지 않는다.
len=$(printf '%s' "$ctx" 2>/dev/null | jq -Rs '[explode[] | if . > 65535 then 2 else 1 end] | add // 0' 2>/dev/null) || exit 0
case "$len" in
  '' | *[!0-9]*) exit 0 ;;
esac
if [ "$len" -gt "$MAX_INJECT_CHARS" ]; then
  printf '[context-pack-injector] skip: %s injection is %s chars (> %s); not injected\n' \
    "$(clean_path "$file")" "$len" "$MAX_INJECT_CHARS" >&2
  exit 0
fi

out=$(jq -cn --arg ctx "$ctx" \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}' 2>/dev/null) || exit 0
[ -n "$out" ] || exit 0

# ── 1회 판정: 베이스·세션 디렉터리를 검증한 뒤 `mkdir -m 700` 으로 마커를 원자적으로 선점 ───────
ensure_dir "$base" || exit 0
ensure_dir "$dir" || exit 0
mkdir -m 700 "$marker" 2>/dev/null || exit 0

# (리뷰 R3-2) 쓰기가 실패하면(stdout 이 닫혔거나 읽는 쪽이 사라짐) 방금 선점한 마커를 되돌려 다음 호출이 다시 주입하게 한다.
printf '%s\n' "$out" 2>/dev/null || rmdir -- "$marker" 2>/dev/null
exit 0
