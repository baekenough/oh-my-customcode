<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	let updating: string | null = null;
	let batchUpdating = false;

	$: outdatedCount = data.projects.filter((p: any) => p.status === 'outdated').length;
	$: latestCount = data.projects.filter((p: any) => p.status === 'latest').length;
	$: unknownCount = data.projects.filter((p: any) => p.status === 'unknown').length;

	const statusConfig: Record<string, { label: string; badge: string }> = {
		latest: {
			label: 'Latest',
			badge: 'bg-emerald-950 text-emerald-400 border-emerald-800'
		},
		outdated: {
			label: 'Outdated',
			badge: 'bg-amber-950 text-amber-400 border-amber-800'
		},
		unknown: {
			label: 'Unknown',
			badge: 'bg-zinc-900 text-zinc-500 border-zinc-700'
		}
	};
</script>

<div class="p-8">
	<!-- Header -->
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-zinc-50">Projects</h1>
			<p class="mt-1 text-sm text-zinc-500">
				{data.projects.length} projects found —
				<span class="text-emerald-400">{latestCount} latest</span>,
				<span class="text-amber-400">{outdatedCount} outdated</span>,
				<span class="text-zinc-500">{unknownCount} unknown</span>
			</p>
		</div>

		{#if outdatedCount > 0}
			<form
				method="POST"
				action="?/updateAll"
				use:enhance={() => {
					batchUpdating = true;
					return async ({ update }) => {
						batchUpdating = false;
						await update();
					};
				}}
			>
				<button
					type="submit"
					disabled={batchUpdating}
					class="rounded px-4 py-2 text-sm font-medium text-white transition-colors
						{batchUpdating
						? 'cursor-not-allowed bg-zinc-700 text-zinc-500'
						: 'bg-emerald-600 hover:bg-emerald-500'}"
				>
					{batchUpdating ? 'Updating...' : `Update All (${outdatedCount})`}
				</button>
			</form>
		{/if}
	</div>

	<!-- Status / error messages -->
	{#if form?.success}
		<div class="mb-6 rounded border border-emerald-800 bg-emerald-950/30 p-4 text-sm text-emerald-300">
			✓ {form.output}
		</div>
	{/if}
	{#if form?.error}
		<div class="mb-6 rounded border border-red-800 bg-red-950/30 p-4 text-sm text-red-300">
			✗ {form.error}
		</div>
	{/if}

	<!-- Project cards -->
	<div class="space-y-3">
		{#each data.projects as project}
			{@const config = statusConfig[project.status] ?? statusConfig.unknown}
			<div
				class="rounded-lg border border-zinc-800 p-5 transition-colors hover:border-zinc-700"
			>
				<div class="flex items-center justify-between">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-3">
							<h3 class="text-lg font-semibold text-zinc-100">{project.name}</h3>
							<span
								class="rounded border px-2 py-0.5 text-xs font-medium {config.badge}"
							>
								{config.label}
							</span>
						</div>
						<p class="mt-1 truncate text-sm text-zinc-500" title={project.path}>
							{project.path}
						</p>
						<div class="mt-2 flex items-center gap-4 text-xs text-zinc-600">
							<span>
								Version: <span class="text-zinc-400">{project.version ?? 'unknown'}</span>
							</span>
						</div>
					</div>

					{#if project.status === 'outdated'}
						<form
							method="POST"
							action="?/update"
							use:enhance={() => {
								updating = project.slug;
								return async ({ update }) => {
									updating = null;
									await update();
								};
							}}
						>
							<input type="hidden" name="path" value={project.path} />
							<button
								type="submit"
								disabled={updating === project.slug || batchUpdating}
								class="ml-4 whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium text-white transition-colors
									{updating === project.slug || batchUpdating
									? 'cursor-not-allowed bg-zinc-700 text-zinc-500'
									: 'bg-amber-600 hover:bg-amber-500'}"
							>
								{updating === project.slug ? 'Updating...' : 'Update'}
							</button>
						</form>
					{/if}
				</div>
			</div>
		{/each}

		{#if data.projects.length === 0}
			<div class="rounded-lg border border-zinc-800 p-12 text-center">
				<p class="text-sm text-zinc-600">No oh-my-customcode projects found.</p>
				<p class="mt-2 text-xs text-zinc-700">
					Searched: ~/workspace, ~/projects, ~/dev, ~/src, ~/code, ~/repos, ~/work
				</p>
			</div>
		{/if}
	</div>
</div>
