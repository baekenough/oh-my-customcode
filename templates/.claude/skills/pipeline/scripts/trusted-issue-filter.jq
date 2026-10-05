# Trust boundary for auto-dev issue selection (#1824).
#
# Input : the JSON array printed by
#           gh issue list --state open --limit 100 --json number,title,labels,body,milestone,author
#         or the single object printed by `gh issue view <N> --json ...,author` (wrapped into an array)
# Args  : --argjson trusted '["login", ...]'   logins with write (push) permission
#         --argjson unattended true|false      pre-triage Phase 0.6 `unattended_mode`
# Output: {unattended, kept: [issue + {author_login, trusted}], excluded: [{number, author_login}]}
#         A malformed issue (not an object) or a malformed author (not an object, login missing or
#         not a string) is EXCLUDED, never an error: it counts as untrusted.
#
# Unattended (anything other than the JSON value `false`): only issues authored by a trusted
# login are kept (fail-closed: an empty `trusted` list, a missing author, or a bot/ghost author not
# listed in `trusted` keeps nothing). Attended (`false`): every issue is kept and only annotated,
# so the manifest can show author and trust.
# Labels are deliberately NOT an authorization signal: issue templates and the
# triage-dispatch workflow attach labels regardless of who opened the issue.
# Logins are compared case-insensitively (GitHub logins are case-insensitive).
(if ($trusted | type) == "array" then $trusted else [] end
 | map(select(type == "string" and length > 0) | ascii_downcase)) as $t
| (if type == "array" then . else [.] end
   | map(
       if type == "object" then
         ((.author | if type == "object" then .login else null end) | if type == "string" then . else "" end) as $login
         | . + {author_login: $login, trusted: ($login != "" and ($t | index($login | ascii_downcase)) != null)}
       else {invalid: true, number: null, author_login: "", trusted: false}
       end
     )) as $issues
| ($issues | map(select(.invalid | not))) as $objs
| {
    unattended: $unattended,
    kept: ($objs | map(select(($unattended == false) or .trusted))),
    excluded: (
      ($objs | map(select(($unattended == false | not) and (.trusted | not)) | {number, author_login}))
      + ($issues | map(select(.invalid) | {number, author_login}))
    )
  }
