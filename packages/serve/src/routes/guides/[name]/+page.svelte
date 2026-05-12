<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<div class="p-8 max-w-4xl">
	<!-- Breadcrumb -->
	<div class="text-sm text-zinc-600 mb-6">
		<a href="/guides" class="hover:text-zinc-400">Guides</a>
		<span class="mx-2">/</span>
		<span class="text-zinc-300">{data.guide.name}</span>
	</div>

	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-zinc-50">{data.guide.name}</h1>
		<div class="text-zinc-600 text-xs mt-1">guides/{data.guide.name}/README.md</div>
	</div>

	<!-- Body -->
	<div class="border border-zinc-800 rounded-lg p-6 prose">
		{@html data.renderedBody}
	</div>
</div>
