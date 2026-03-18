<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: '▣' },
		{ href: '/agents', label: 'Agents', icon: '◈' },
		{ href: '/skills', label: 'Skills', icon: '◆' },
		{ href: '/guides', label: 'Guides', icon: '◉' },
		{ href: '/rules', label: 'Rules', icon: '◇' },
		{ href: '/evaluations', label: 'Evaluations', icon: '★' }
	];

	function isActive(href: string, pathname: string): boolean {
		if (href === '/') return pathname === '/';
		return pathname.startsWith(href);
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
					href={item.href}
					class="flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors {isActive(item.href, $page.url.pathname)
						? 'bg-zinc-800 text-zinc-50'
						: 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}"
				>
					<span class="text-xs opacity-70">{item.icon}</span>
					{item.label}
				</a>
			{/each}
		</nav>

		<!-- Footer -->
		<div class="px-4 py-3 border-t border-zinc-800 text-zinc-600 text-xs">
			oh-my-customcode
		</div>
	</aside>

	<!-- Main content -->
	<main class="flex-1 overflow-auto bg-zinc-950">
		<slot />
	</main>
</div>
