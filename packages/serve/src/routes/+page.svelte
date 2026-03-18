<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	const summaryCards = [
		{ label: 'Agents', key: 'agents' as const, href: '/agents', icon: '◈', color: 'emerald' },
		{ label: 'Skills', key: 'skills' as const, href: '/skills', icon: '◆', color: 'sky' },
		{ label: 'Guides', key: 'guides' as const, href: '/guides', icon: '◉', color: 'violet' },
		{ label: 'Rules', key: 'rules' as const, href: '/rules', icon: '◇', color: 'amber' }
	];

	const colorMap: Record<string, string> = {
		emerald: 'border-emerald-800 bg-emerald-950/40 hover:bg-emerald-950/70 text-emerald-300',
		sky: 'border-sky-800 bg-sky-950/40 hover:bg-sky-950/70 text-sky-300',
		violet: 'border-violet-800 bg-violet-950/40 hover:bg-violet-950/70 text-violet-300',
		amber: 'border-amber-800 bg-amber-950/40 hover:bg-amber-950/70 text-amber-300'
	};

	const priorityColor: Record<string, string> = {
		MUST: 'text-red-400',
		SHOULD: 'text-yellow-400',
		MAY: 'text-green-400'
	};
</script>

<div class="p-8">
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-zinc-50">Dashboard</h1>
		<p class="text-zinc-500 text-sm mt-1">Project root: <code class="text-zinc-400">{data.root}</code></p>
	</div>

	<!-- Summary cards -->
	<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
		{#each summaryCards as card}
			<a
				href={card.href}
				class="border rounded-lg p-5 transition-colors cursor-pointer {colorMap[card.color]}"
			>
				<div class="text-2xl mb-2">{card.icon}</div>
				<div class="text-3xl font-bold">{data.counts[card.key]}</div>
				<div class="text-sm mt-1 opacity-80">{card.label}</div>
			</a>
		{/each}
	</div>

	<!-- Breakdown tables -->
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Agent type breakdown -->
		<div class="col-span-1 lg:col-span-1">
			<h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Agent Types</h2>
			<div class="border border-zinc-800 rounded-lg overflow-hidden">
				<table class="w-full text-sm">
					<thead>
						<tr class="bg-zinc-900">
							<th class="px-4 py-2 text-left text-zinc-400 font-medium">Type</th>
							<th class="px-4 py-2 text-right text-zinc-400 font-medium">Count</th>
						</tr>
					</thead>
					<tbody>
						{#each data.typeBreakdown as row, i}
							<tr class="border-t border-zinc-800 {i % 2 === 1 ? 'bg-zinc-900/50' : ''}">
								<td class="px-4 py-2 text-zinc-300">{row.label}</td>
								<td class="px-4 py-2 text-right text-zinc-400">{row.count}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Skill scope breakdown -->
		<div>
			<h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Skill Scopes</h2>
			<div class="border border-zinc-800 rounded-lg overflow-hidden">
				<table class="w-full text-sm">
					<thead>
						<tr class="bg-zinc-900">
							<th class="px-4 py-2 text-left text-zinc-400 font-medium">Scope</th>
							<th class="px-4 py-2 text-right text-zinc-400 font-medium">Count</th>
						</tr>
					</thead>
					<tbody>
						{#each data.scopeBreakdown as row, i}
							<tr class="border-t border-zinc-800 {i % 2 === 1 ? 'bg-zinc-900/50' : ''}">
								<td class="px-4 py-2 text-zinc-300">{row.scope}</td>
								<td class="px-4 py-2 text-right text-zinc-400">{row.count}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Rule priority breakdown -->
		<div>
			<h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Rule Priorities</h2>
			<div class="border border-zinc-800 rounded-lg overflow-hidden">
				<table class="w-full text-sm">
					<thead>
						<tr class="bg-zinc-900">
							<th class="px-4 py-2 text-left text-zinc-400 font-medium">Priority</th>
							<th class="px-4 py-2 text-right text-zinc-400 font-medium">Count</th>
						</tr>
					</thead>
					<tbody>
						{#each data.priorityBreakdown as row, i}
							<tr class="border-t border-zinc-800 {i % 2 === 1 ? 'bg-zinc-900/50' : ''}">
								<td class="px-4 py-2 font-semibold {priorityColor[row.priority]}">{row.priority}</td>
								<td class="px-4 py-2 text-right text-zinc-400">{row.count}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</div>
</div>
