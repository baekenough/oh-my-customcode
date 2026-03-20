<script lang="ts">
	import { page } from '$app/stores';
</script>

<div class="flex min-h-screen items-center justify-center bg-zinc-950">
	<div class="text-center">
		<div class="text-6xl font-bold text-zinc-700 mb-4">{$page.status}</div>
		<h1 class="text-xl font-semibold text-zinc-300 mb-2">
			{#if $page.status === 404}
				Page not found
			{:else if $page.status === 403}
				Access denied
			{:else if $page.status >= 500}
				Server error
			{:else}
				Something went wrong
			{/if}
		</h1>
		<p class="text-zinc-600 text-sm mb-6">
			{$page.error?.message ?? 'An unexpected error occurred.'}
		</p>
		<a
			href="/"
			class="inline-block rounded px-4 py-2 text-sm font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
		>
			Back to Dashboard
		</a>
	</div>
</div>
