<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	export let data; // From +layout.server.ts: { projects, selectedProject, root }

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: '▣' }
	];

	const coreItems = [
		{ href: '/agents', label: 'Agents', icon: '◈' },
		{ href: '/skills', label: 'Skills', icon: '◆' },
		{ href: '/guides', label: 'Guides', icon: '◉' },
		{ href: '/rules', label: 'Rules', icon: '◇' },
		{ href: '/evaluations', label: 'Evaluations', icon: '★' },
		{ href: '/graph', label: 'Graph', icon: '◎' }
	];

	let coreOpen = true;

	function isActive(href: string, pathname: string): boolean {
		if (href === '/') return pathname === '/';
		return pathname.startsWith(href);
	}

	$: currentProjectName = data.selectedProject
		? data.projects.find((p: any) => p.slug === data.selectedProject)?.name ?? 'Unknown'
		: data.root?.split('/').pop() ?? 'Default';

	$: projectParam = data.selectedProject ? `?project=${data.selectedProject}` : '';

	$: if (coreItems.some(item => isActive(item.href, $page.url.pathname))) {
		coreOpen = true;
	}
</script>

<div class="flex min-h-screen">
	<!-- Sidebar -->
	<aside class="w-52 shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col">
		<!-- Logo -->
		<div class="px-4 py-5 border-b border-zinc-800">
			<span class="text-emerald-400 font-bold text-lg tracking-tight">omcustom</span>
			<div class="text-zinc-600 text-xs mt-0.5">agent harness</div>
		</div>

		<!-- Nav -->
		<nav class="flex-1 px-2 py-4 space-y-0.5">
			{#each navItems as item}
				<a
					href="{item.href}{projectParam}"
					class="flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors {isActive(item.href, $page.url.pathname)
						? 'bg-zinc-800 text-zinc-50'
						: 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}"
				>
					<span class="text-xs opacity-70">{item.icon}</span>
					{item.label}
				</a>
			{/each}

			<!-- Core category -->
			<button
				onclick={() => coreOpen = !coreOpen}
				class="flex items-center gap-2 px-3 py-2 w-full text-left rounded text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors mt-3"
			>
				<span class="text-[10px]">{coreOpen ? '▾' : '▸'}</span>
				Core
			</button>

			{#if coreOpen}
				<div class="space-y-0.5">
					{#each coreItems as item}
						<a
							href="{item.href}{projectParam}"
							class="flex items-center gap-2.5 px-3 py-2 pl-6 rounded text-sm transition-colors {isActive(item.href, $page.url.pathname)
								? 'bg-zinc-800 text-zinc-50'
								: 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}"
						>
							<span class="text-xs opacity-70">{item.icon}</span>
							{item.label}
						</a>
					{/each}
				</div>
			{/if}
		</nav>

		<!-- Footer -->
		<div class="px-4 py-3 border-t border-zinc-800 text-zinc-600 text-xs">
			{currentProjectName}
		</div>
	</aside>

	<!-- Main content -->
	<main class="flex-1 overflow-auto bg-zinc-950">
		<slot />
	</main>
</div>
