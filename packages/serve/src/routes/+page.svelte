<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	const statusConfig: Record<string, { label: string; dot: string; badge: string }> = {
		latest: {
			label: 'Latest',
			dot: 'text-emerald-500',
			badge: 'bg-emerald-950 text-emerald-400 border-emerald-800'
		},
		outdated: {
			label: 'Outdated',
			dot: 'text-amber-500',
			badge: 'bg-amber-950 text-amber-400 border-amber-800'
		},
		unknown: {
			label: 'Unknown',
			dot: 'text-zinc-600',
			badge: 'bg-zinc-900 text-zinc-500 border-zinc-700'
		}
	};

	$: currentProjectLabel = data.selectedProject
		? data.projects.find((p) => p.slug === data.selectedProject)?.name ?? 'Selected Project'
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

	<!-- Current project stats -->
	<div class="mb-10">
		<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
			Current Project
		</h2>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
			<a
				href="/agents{projectParam}"
				class="rounded-lg border border-emerald-800 bg-emerald-950/40 p-5 transition-colors hover:bg-emerald-950/70"
			>
				<div class="mb-2 text-2xl text-emerald-300">◈</div>
				<div class="text-3xl font-bold text-emerald-300">{data.projectStats.agents}</div>
				<div class="mt-1 text-sm text-emerald-300/80">Agents</div>
			</a>
			<a
				href="/skills{projectParam}"
				class="rounded-lg border border-sky-800 bg-sky-950/40 p-5 transition-colors hover:bg-sky-950/70"
			>
				<div class="mb-2 text-2xl text-sky-300">◆</div>
				<div class="text-3xl font-bold text-sky-300">{data.projectStats.skills}</div>
				<div class="mt-1 text-sm text-sky-300/80">Skills</div>
			</a>
			{#if data.analytics}
				<div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
					<div class="mb-2 text-2xl text-zinc-400">⊕</div>
					<div class="text-3xl font-bold text-zinc-100">{data.analytics.sessions.thisWeek}</div>
					<div class="mt-1 text-sm text-zinc-400">Sessions (7d)</div>
				</div>
				<div class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
					<div class="mb-2 text-2xl text-zinc-400">◎</div>
					<div
						class="text-3xl font-bold mt-0
						{data.analytics.totalInvocations === 0
							? 'text-zinc-500'
							: data.analytics.successRate >= 0.9
								? 'text-emerald-400'
								: data.analytics.successRate >= 0.7
									? 'text-amber-400'
									: 'text-red-400'}"
					>
						{data.analytics.totalInvocations === 0
							? '—'
							: `${(data.analytics.successRate * 100).toFixed(0)}%`}
					</div>
					<div class="mt-1 text-sm text-zinc-400">Success Rate</div>
				</div>
			{:else}
				<div class="col-span-2 rounded-lg border border-zinc-800 bg-zinc-900/20 p-5 flex items-center gap-3">
					<div class="text-zinc-600 text-sm">
						Enable eval-core to see session statistics
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Analytics section -->
	{#if data.analytics && (data.analytics.sessions.thisMonth > 0 || data.analytics.agentInvocations.length > 0)}
		<div class="mb-10">
			<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Analytics</h2>

			<!-- Session timeline -->
			<div class="mb-6 grid grid-cols-3 gap-4">
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
									{#each data.analytics.agentInvocations.slice(0, 8) as row, i}
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
									{#each data.analytics.skillInvocations.slice(0, 8) as row, i}
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
	{/if}

	<!-- All projects overview -->
	<div>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">
				All Projects
				<span class="ml-2 font-normal normal-case text-zinc-600">
					{data.projectSummary.total} found —
					<span class="text-emerald-500">{data.projectSummary.latest} latest</span>,
					<span class="text-amber-500">{data.projectSummary.outdated} outdated</span>
				</span>
			</h2>
			<a
				href="/projects"
				class="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
			>
				View all →
			</a>
		</div>

		{#if data.projects.length > 0}
			<div class="space-y-2">
				{#each data.projects as project}
					{@const config = statusConfig[project.status] ?? statusConfig.unknown}
					<div class="flex items-center justify-between rounded-lg border border-zinc-800 px-5 py-4 transition-colors hover:border-zinc-700">
						<div class="flex items-center gap-3 min-w-0">
							<span class="text-xs {config.dot}">●</span>
							<div class="min-w-0">
								<span class="font-medium text-zinc-200">{project.name}</span>
								<p class="mt-0.5 truncate text-xs text-zinc-600" title={project.path}>{project.path}</p>
							</div>
						</div>
						<div class="ml-4 flex items-center gap-3 shrink-0">
							{#if project.version}
								<span class="text-xs text-zinc-600">v{project.version}</span>
							{/if}
							<span class="rounded border px-2 py-0.5 text-xs font-medium {config.badge}">
								{config.label}
							</span>
						</div>
					</div>
				{/each}

				{#if data.projectSummary.total > data.projects.length}
					<a
						href="/projects"
						class="block rounded-lg border border-zinc-800/50 px-5 py-3 text-center text-xs text-zinc-600 transition-colors hover:border-zinc-700 hover:text-zinc-400"
					>
						+{data.projectSummary.total - data.projects.length} more projects — View all
					</a>
				{/if}
			</div>
		{:else}
			<div class="rounded-lg border border-zinc-800 p-8 text-center">
				<p class="text-sm text-zinc-600">No oh-my-customcode projects found.</p>
				<p class="mt-2 text-xs text-zinc-700">
					Searched: ~/workspace, ~/projects, ~/dev, ~/src, ~/code, ~/repos, ~/work
				</p>
			</div>
		{/if}
	</div>
</div>
