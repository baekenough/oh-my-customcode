#!/usr/bin/env bun
/**
 * Daily Issue Report Script
 * Sends a daily email report of open issues from specified repositories.
 *
 * Usage: bun run .github/scripts/send-report.ts
 *
 * Environment Variables:
 *     GITHUB_TOKEN, GMAIL_USER, GMAIL_APP_PASSWORD, REPORT_EMAIL, REPOSITORIES
 */

import nodemailer from 'nodemailer';

const REPOSITORIES = (process.env.REPOSITORIES || 'baekenough/oh-my-customcode')
  .split(',')
  .map(r => r.trim());

interface GitHubIssue {
  number: number;
  title: string;
  url: string;
  created_at: string;
  labels: string[];
}

interface RepoIssues {
  [repo: string]: GitHubIssue[];
}

async function getOpenIssues(repo: string, token: string): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = [];
  let page = 1;

  while (true) {
    const url = new URL(`https://api.github.com/repos/${repo}/issues`);
    url.searchParams.set('state', 'open');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', page.toString());

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) break;

    const pageIssues = await response.json();
    if (!Array.isArray(pageIssues) || pageIssues.length === 0) break;

    for (const issue of pageIssues) {
      if (!('pull_request' in issue)) {
        issues.push({
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          created_at: issue.created_at,
          labels: (issue.labels || []).map((l: { name: string }) => l.name),
        });
      }
    }

    page++;
    if (pageIssues.length < 100) break;
  }

  return issues;
}

function formatKSTDate(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;

  return `${year}년 ${month}월 ${day}일 ${hour}:${minute} KST`;
}

function formatTextReport(repoIssues: RepoIssues): string {
  const dateStr = formatKSTDate();
  const lines: string[] = [
    '📋 일일 GitHub 이슈 리포트',
    '━'.repeat(28),
    `📅 ${dateStr}`,
    '',
  ];

  let totalIssues = 0;

  for (const [repo, issues] of Object.entries(repoIssues)) {
    lines.push(`📁 ${repo}`);
    if (issues.length > 0) {
      lines.push(`   📌 Open 이슈: ${issues.length}개`);
      for (const issue of issues) {
        lines.push(`   • #${issue.number}: ${issue.title}`);
      }
      totalIssues += issues.length;
    } else {
      lines.push('   ✅ 등록된 이슈가 없습니다.');
    }
    lines.push('');
  }

  lines.push('━'.repeat(28));
  lines.push(`총 Open 이슈: ${totalIssues}개`);

  return lines.join('\n');
}

function formatHtmlReport(repoIssues: RepoIssues): string {
  const dateStr = formatKSTDate();
  const totalIssues = Object.values(repoIssues).reduce(
    (sum, issues) => sum + issues.length,
    0
  );

  const htmlParts: string[] = [
    '<!DOCTYPE html>',
    "<html><head><meta charset='utf-8'></head>",
    "<body style='font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;'>",
    "<h1 style='border-bottom: 2px solid #333; padding-bottom: 10px;'>📋 일일 GitHub 이슈 리포트</h1>",
    `<p style='color: #666;'>📅 ${dateStr}</p>`,
  ];

  for (const [repo, issues] of Object.entries(repoIssues)) {
    htmlParts.push(`<h2 style='margin-top: 24px;'>📁 ${repo}</h2>`);
    if (issues.length > 0) {
      htmlParts.push(
        `<p><strong>📌 Open 이슈: ${issues.length}개</strong></p>`
      );
      htmlParts.push("<ul style='list-style-type: none; padding-left: 0;'>");
      for (const issue of issues) {
        let labelsHtml = '';
        if (issue.labels.length > 0) {
          labelsHtml =
            ' ' +
            issue.labels
              .slice(0, 3)
              .map(
                (label) =>
                  `<span style='background: #e1e4e8; padding: 2px 6px; border-radius: 3px; font-size: 12px; margin-left: 4px;'>${label}</span>`
              )
              .join('');
        }
        htmlParts.push(
          `<li style='margin: 8px 0; padding: 8px; background: #f6f8fa; border-radius: 6px;'>` +
            `<a href='${issue.url}' style='color: #0366d6; text-decoration: none;'>` +
            `<strong>#${issue.number}</strong>: ${issue.title}</a>${labelsHtml}</li>`
        );
      }
      htmlParts.push('</ul>');
    } else {
      htmlParts.push(
        "<p style='color: #28a745;'>✅ 등록된 이슈가 없습니다.</p>"
      );
    }
  }

  htmlParts.push(
    "<hr style='margin-top: 24px; border: none; border-top: 2px solid #333;'>",
    `<p style='font-weight: bold;'>총 Open 이슈: ${totalIssues}개</p>`,
    "<p style='color: #666; font-size: 12px; margin-top: 20px;'>이 리포트는 GitHub Actions에 의해 자동 생성되었습니다.</p>",
    '</body></html>'
  );

  return htmlParts.join('\n');
}

async function sendEmail(
  toEmail: string,
  subject: string,
  textBody: string,
  htmlBody: string,
  gmailUser: string,
  gmailPassword: string
): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: gmailUser,
        pass: gmailPassword,
      },
    });

    await transporter.sendMail({
      from: gmailUser,
      to: toEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });

    return true;
  } catch (error) {
    console.error(`Failed to send email: ${error}`);
    return false;
  }
}

async function main() {
  const githubToken = process.env.GITHUB_TOKEN;
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;
  const reportEmail = process.env.REPORT_EMAIL;

  if (!githubToken) {
    console.error('❌ GITHUB_TOKEN not set');
    process.exit(1);
  }
  if (!gmailUser || !gmailPassword) {
    console.error('❌ GMAIL_USER or GMAIL_APP_PASSWORD not set');
    process.exit(1);
  }
  if (!reportEmail) {
    console.error('❌ REPORT_EMAIL not set');
    process.exit(1);
  }

  console.log('📋 Daily Issue Report Generator');

  const repoIssues: RepoIssues = {};

  for (const repo of REPOSITORIES) {
    console.log(`\n📥 Fetching issues from ${repo}...`);
    const issues = await getOpenIssues(repo, githubToken);
    repoIssues[repo] = issues;
    console.log(`   Found ${issues.length} open issues`);
  }

  const textReport = formatTextReport(repoIssues);
  const htmlReport = formatHtmlReport(repoIssues);

  console.log('\n' + textReport);

  const dateStr = formatKSTDate();
  const subject = `📋 일일 GitHub 이슈 리포트 - ${dateStr}`;

  if (
    await sendEmail(
      reportEmail,
      subject,
      textReport,
      htmlReport,
      gmailUser,
      gmailPassword
    )
  ) {
    console.log('✅ Email sent successfully!');
  } else {
    console.error('❌ Failed to send email');
    process.exit(1);
  }
}

main();
