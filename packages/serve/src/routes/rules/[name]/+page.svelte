<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	const priorityBadge: Record<string, string> = {
		MUST: 'bg-red-900/60 text-red-300 border-red-800',
		SHOULD: 'bg-yellow-900/60 text-yellow-300 border-yellow-800',
		MAY: 'bg-green-900/60 text-green-300 border-green-800'
	};
</script>

<div class="p-8 max-w-4xl">
	<!-- Breadcrumb -->
	<div class="text-sm text-zinc-600 mb-6">
		<a href="/rules" class="hover:text-zinc-400">Rules</a>
		<span class="mx-2">/</span>
		<span class="text-zinc-300">{data.rule.name}</span>
	</div>

	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3 mb-2">
			{#if data.rule.id}
				<span class="text-zinc-500 font-mono text-sm">{data.rule.id}</span>
			{/if}
			<span class="px-2 py-0.5 rounded border text-xs font-bold {priorityBadge[data.rule.priority] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}">
				{data.rule.priority}
			</span>
			<h1 class="text-2xl font-bold text-zinc-50">{data.rule.name}</h1>
		</div>
		{#if data.rule.description}
			<p class="text-zinc-400">{data.rule.description}</p>
		{/if}
	</div>

	<!-- Body -->
	<div class="border border-zinc-800 rounded-lg p-6 prose">
		{@html data.renderedBody}
	</div>
</div>
