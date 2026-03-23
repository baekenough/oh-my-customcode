<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: currentProjectLabel = data.selectedProject
		? data.selectedProject
		: data.root?.split('/').pop() ?? 'Default Project';

	$: projectParam = data.selectedProject ? `?project=${data.selectedProject}` : '';
</script>

<div class="p-8">
	<!-- Page header -->
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-zinc-50">Dashboard</h1>
		<p class="mt-1 text-sm text-zinc-500">
			Viewing: <span class="text-zinc-300">{currentProjectLabel}</span>
			<span class="ml-2 text-zinc-600">·</span>
			<code class="ml-2 text-xs text-zinc-600">{data.root}</code>
		</p>
	</div>

	{#if data.projectNotFound}
		<div class="mb-6 rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
			Project "<code class="font-mono">{data.selectedProject}</code>" not found. Showing default project.
		</div>
	{/if}

	<!-- Analytics section -->
	{#if data.analytics}
		<div class="mb-10">
			<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Analytics</h2>

			<!-- Session + success rate row -->
			<div class="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
				<div class="rounded-lg border border-zinc-800 p-4">
					<div class="text-xs uppercase tracking-wider text-zinc-500">Today</div>
					<div class="mt-1 text-2xl font-bold text-zinc-100">{data.analytics.sessions.today}</div>
					<div class="text-xs text-zinc-600">sessions</div>
				</div>
				<div class="rounded-lg border border-zinc-800 p-4">
					<div class="text-xs uppercase tracking-wider text-zinc-500">This Week</div>
					<div class="mt-1 text-2xl font-bold text-zinc-100">{data.analytics.sessions.thisWeek}</div>
					<div class="text-xs text-zinc-600">sessions</div>
				</div>
				<div class="rounded-lg border border-zinc-800 p-4">
					<div class="text-xs uppercase tracking-wider text-zinc-500">This Month</div>
					<div class="mt-1 text-2xl font-bold text-zinc-100">{data.analytics.sessions.thisMonth}</div>
					<div class="text-xs text-zinc-600">sessions</div>
				</div>
				<div class="rounded-lg border border-zinc-800 p-4">
					<div class="text-xs uppercase tracking-wider text-zinc-500">Success Rate</div>
					<div
						class="mt-1 text-2xl font-bold
						{data.analytics.successRate >= 0.9
							? 'text-emerald-400'
							: data.analytics.successRate >= 0.7
								? 'text-amber-400'
								: 'text-red-400'}"
					>
						{(data.analytics.successRate * 100).toFixed(1)}%
					</div>
					<div class="text-xs text-zinc-600">{data.analytics.totalInvocations} invocations</div>
				</div>
			</div>

			<!-- Top agents + top skills -->
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<div>
					<h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
						Top Agents
					</h3>
					{#if data.analytics.agentInvocations.length > 0}
						<div class="overflow-hidden rounded-lg border border-zinc-800">
							<table class="w-full text-sm">
								<thead>
									<tr class="bg-zinc-900">
										<th class="px-4 py-2 text-left font-medium text-zinc-400">Agent</th>
										<th class="px-4 py-2 text-right font-medium text-zinc-400">Uses</th>
										<th class="px-4 py-2 text-right font-medium text-zinc-400">Success</th>
									</tr>
								</thead>
								<tbody>
									{#each data.analytics.agentInvocations.slice(0, 10) as row, i}
										<tr class="border-t border-zinc-800 {i % 2 === 1 ? 'bg-zinc-900/50' : ''}">
											<td class="px-4 py-2 font-mono text-xs text-zinc-300">{row.agentType}</td>
											<td class="px-4 py-2 text-right text-zinc-400">{row.count}</td>
											<td
												class="px-4 py-2 text-right {row.successRate >= 0.9
													? 'text-emerald-400'
													: row.successRate >= 0.7
														? 'text-amber-400'
														: 'text-red-400'}"
											>
												{(row.successRate * 100).toFixed(0)}%
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<div class="rounded-lg border border-zinc-800 p-6 text-center text-sm text-zinc-600">
							No agent data yet. Run Claude Code sessions to populate.
						</div>
					{/if}
				</div>

				<div>
					<h3 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
						Top Skills
					</h3>
					{#if data.analytics.skillInvocations.length > 0}
						<div class="overflow-hidden rounded-lg border border-zinc-800">
							<table class="w-full text-sm">
								<thead>
									<tr class="bg-zinc-900">
										<th class="px-4 py-2 text-left font-medium text-zinc-400">Skill</th>
										<th class="px-4 py-2 text-right font-medium text-zinc-400">Uses</th>
									</tr>
								</thead>
								<tbody>
									{#each data.analytics.skillInvocations.slice(0, 10) as row, i}
										<tr class="border-t border-zinc-800 {i % 2 === 1 ? 'bg-zinc-900/50' : ''}">
											<td class="px-4 py-2 font-mono text-xs text-zinc-300">{row.skill}</td>
											<td class="px-4 py-2 text-right text-zinc-400">{row.count}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<div class="rounded-lg border border-zinc-800 p-6 text-center text-sm text-zinc-600">
							No skill data yet. Run Claude Code sessions to populate.
						</div>
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<div class="mb-10">
			<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Analytics</h2>
			<div class="rounded-lg border border-zinc-800 bg-zinc-900/20 px-5 py-6 text-sm text-zinc-600">
				No session data yet. Analytics appear after Claude Code sessions are recorded via
				<code class="text-zinc-500">eval-core</code>.
			</div>
		</div>
	{/if}

	<!-- Project overview -->
	<div>
		<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
			Project Overview
		</h2>
		<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
			<a href="/agents{projectParam}" class="rounded-lg border border-zinc-800 p-4 transition-colors hover:border-zinc-700">
				<div class="text-2xl font-bold text-zinc-100">{data.projectDetail.agentCount}</div>
				<div class="mt-1 text-xs text-zinc-500">Agents</div>
			</a>
			<a href="/skills{projectParam}" class="rounded-lg border border-zinc-800 p-4 transition-colors hover:border-zinc-700">
				<div class="text-2xl font-bold text-zinc-100">{data.projectDetail.skillCount}</div>
				<div class="mt-1 text-xs text-zinc-500">Skills</div>
			</a>
			<a href="/guides{projectParam}" class="rounded-lg border border-zinc-800 p-4 transition-colors hover:border-zinc-700">
				<div class="text-2xl font-bold text-zinc-100">{data.projectDetail.guideCount}</div>
				<div class="mt-1 text-xs text-zinc-500">Guides</div>
			</a>
			<a href="/rules{projectParam}" class="rounded-lg border border-zinc-800 p-4 transition-colors hover:border-zinc-700">
				<div class="text-2xl font-bold text-zinc-100">{data.projectDetail.ruleCount}</div>
				<div class="mt-1 text-xs text-zinc-500">Rules</div>
			</a>
		</div>
	</div>
</div>
