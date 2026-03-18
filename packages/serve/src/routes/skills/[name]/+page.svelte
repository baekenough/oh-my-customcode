<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	const scopeColor: Record<string, string> = {
		core: 'bg-emerald-900/60 text-emerald-300 border-emerald-800',
		harness: 'bg-amber-900/60 text-amber-300 border-amber-800',
		package: 'bg-sky-900/60 text-sky-300 border-sky-800'
	};
</script>

<div class="p-8 max-w-5xl">
	<!-- Breadcrumb -->
	<div class="text-sm text-zinc-600 mb-6">
		<a href="/skills" class="hover:text-zinc-400">Skills</a>
		<span class="mx-2">/</span>
		<span class="text-zinc-300">{data.skill.name}</span>
	</div>

	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center gap-3 mb-2">
			<h1 class="text-2xl font-bold text-zinc-50">{data.skill.name}</h1>
			<span class="px-2 py-0.5 rounded border text-xs font-medium {scopeColor[data.skill.scope] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}">
				{data.skill.scope}
			</span>
		</div>
		{#if data.skill.description}
			<p class="text-zinc-400">{data.skill.description}</p>
		{/if}
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
		<!-- Metadata -->
		<div class="lg:col-span-1">
			<div class="border border-zinc-800 rounded-lg overflow-hidden">
				<div class="bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
					Metadata
				</div>
				<table class="w-full text-sm">
					<tbody>
						{#each data.displayMeta as { key, value }}
							<tr class="border-t border-zinc-800">
								<td class="px-4 py-2 text-zinc-500 font-medium">{key}</td>
								<td class="px-4 py-2 text-zinc-300 break-all">{value || '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Body -->
		<div class="lg:col-span-3">
			<div class="border border-zinc-800 rounded-lg p-6 prose">
				{@html data.renderedBody}
			</div>
		</div>
	</div>
</div>
