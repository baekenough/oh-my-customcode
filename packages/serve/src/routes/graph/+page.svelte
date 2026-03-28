<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import type { PageData } from './$types';
	import type { GraphNode } from '$lib/server/graph-builder.js';

	let { data }: { data: PageData } = $props();

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------

	let svgEl = $state<SVGSVGElement | null>(null);
	let searchQuery = $state('');
	let activeFilter = $state<'all' | 'agent' | 'skill' | 'guide'>('all');
	let currentZoomScale = $state(1);
	let tooltip = $state<{ visible: boolean; x: number; y: number; node: GraphNode | null }>({
		visible: false,
		x: 0,
		y: 0,
		node: null
	});
	let selectedNode = $state<string | null>(null);
	let liveMessage = $state('');

	const graphData = $derived(data.graphData);

	// ---------------------------------------------------------------------------
	// Domain → color mapping
	// ---------------------------------------------------------------------------

	const domainColor: Record<string, string> = {
		backend: '#f97316',
		frontend: '#ec4899',
		'data-engineering': '#06b6d4',
		database: '#3b82f6',
		management: '#a1a1aa',
		security: '#ef4444',
		qa: '#22c55e',
		architecture: '#6366f1',
		universal: '#71717a'
	};

	function agentColor(domain: string | undefined): string {
		return domain ? (domainColor[domain] ?? '#71717a') : '#71717a';
	}

	// ---------------------------------------------------------------------------
	// Counts
	// ---------------------------------------------------------------------------

	const agentCount = $derived(graphData.nodes.filter((n) => n.type === 'agent').length);
	const skillCount = $derived(graphData.nodes.filter((n) => n.type === 'skill').length);
	const guideCount = $derived(graphData.nodes.filter((n) => n.type === 'guide').length);

	// ---------------------------------------------------------------------------
	// D3 lifecycle
	// ---------------------------------------------------------------------------

	let simulationRef: d3.Simulation<any, any> | null = null;

	function buildGraph(nodes: any[], edges: any[]) {
		if (!svgEl) return;

		const container = svgEl.parentElement!;
		const width = container.clientWidth;
		const height = container.clientHeight;

		// Clear previous
		d3.select(svgEl).selectAll('*').remove();

		const svg = d3
			.select(svgEl)
			.attr('width', width)
			.attr('height', height)
			.attr('viewBox', [0, 0, width, height]);

		// Zoom/pan container
		const g = svg.append('g').attr('class', 'graph-root');

		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 4])
			.on('zoom', (event) => {
				g.attr('transform', event.transform);
				const k = event.transform.k;
				const wasHidden = currentZoomScale < 0.5;
				const shouldHide = k < 0.5;
				currentZoomScale = k;
				if (wasHidden !== shouldHide) {
					g.selectAll('.node text').attr('display', shouldHide ? 'none' : null);
				}
			});

		svg.call(zoom);

		// Reset selection on background click
		svg.on('click', (event) => {
			if (event.target === svgEl || event.target === g.node()) {
				selectedNode = null;
				updateHighlight(null, linkSel, nodeSel);
			}
		});

		// Deep-copy nodes/edges for d3 mutation
		const simNodes: any[] = nodes.map((n) => ({ ...n }));
		const nodeById = new Map(simNodes.map((n) => [n.id, n]));

		const simEdges: any[] = edges
			.map((e) => ({
				...e,
				source: nodeById.get(e.source) ?? e.source,
				target: nodeById.get(e.target) ?? e.target
			}))
			.filter(
				(e) =>
					typeof e.source === 'object' &&
					e.source !== null &&
					typeof e.target === 'object' &&
					e.target !== null
			);

		// Simulation
		const simulation = d3
			.forceSimulation(simNodes)
			.force(
				'link',
				d3
					.forceLink(simEdges)
					.id((d: any) => d.id)
					.distance(80)
			)
			.force('charge', d3.forceManyBody().strength(-200))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(15));

		simulationRef = simulation;

		// Reduced-motion: skip animation, position nodes immediately
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			simulation.alpha(0).stop();
			simulation.tick(300);
		}

		// Arrow markers
		const defs = svg.append('defs');
		for (const [rel, color] of [
			['requires', '#3f3f46'],
			['routes_to', '#3f3f46']
		]) {
			defs
				.append('marker')
				.attr('id', `arrow-${rel}`)
				.attr('viewBox', '0 -5 10 10')
				.attr('refX', 20)
				.attr('refY', 0)
				.attr('markerWidth', 6)
				.attr('markerHeight', 6)
				.attr('orient', 'auto')
				.append('path')
				.attr('d', 'M0,-5L10,0L0,5')
				.attr('fill', color as string)
				.attr('opacity', 0.5);
		}

		// Edges
		const linkSel = g
			.append('g')
			.attr('class', 'links')
			.selectAll('line')
			.data(simEdges)
			.join('line')
			.attr('stroke', '#3f3f46')
			.attr('stroke-opacity', (d: any) => (d.relation === 'requires' ? 0.6 : 0.4))
			.attr('stroke-dasharray', (d: any) => (d.relation === 'routes_to' ? '4,4' : null))
			.attr('stroke-width', 1)
			.attr('marker-end', (d: any) => `url(#arrow-${d.relation})`);

		// Nodes group
		const nodeSel = g
			.append('g')
			.attr('class', 'nodes')
			.selectAll('g')
			.data(simNodes)
			.join('g')
			.attr('class', 'node')
			.attr('cursor', 'pointer')
			.attr('tabindex', '0')
			.attr('role', 'button')
			.attr('aria-label', (d: any) => d.label)
			.call(
				d3
					.drag<SVGGElement, any>()
					.on('start', (event, d) => {
						if (!event.active) simulation.alphaTarget(0.3).restart();
						d.fx = d.x;
						d.fy = d.y;
					})
					.on('drag', (event, d) => {
						d.fx = event.x;
						d.fy = event.y;
					})
					.on('end', (event, d) => {
						if (!event.active) simulation.alphaTarget(0);
						d.fx = null;
						d.fy = null;
					}) as any
			);

		// Node shapes
		nodeSel.each(function (d: any) {
			const node = d3.select(this);
			if (d.type === 'agent') {
				node
					.append('circle')
					.attr('r', 10)
					.attr('fill', agentColor(d.domain))
					.attr('fill-opacity', 0.9)
					.attr('stroke', '#18181b')
					.attr('stroke-width', 1.5);
			} else if (d.type === 'skill') {
				node
					.append('rect')
					.attr('x', -6)
					.attr('y', -6)
					.attr('width', 12)
					.attr('height', 12)
					.attr('rx', 2)
					.attr('fill', '#10b981')
					.attr('fill-opacity', 0.9)
					.attr('stroke', '#18181b')
					.attr('stroke-width', 1.5);
			} else {
				// guide — diamond (rotated square)
				node
					.append('rect')
					.attr('x', -6)
					.attr('y', -6)
					.attr('width', 12)
					.attr('height', 12)
					.attr('transform', 'rotate(45)')
					.attr('fill', '#a78bfa')
					.attr('fill-opacity', 0.9)
					.attr('stroke', '#18181b')
					.attr('stroke-width', 1.5);
			}

			// Label
			node
				.append('text')
				.attr('dy', 20)
				.attr('text-anchor', 'middle')
				.attr('font-size', '9px')
				.attr('fill', '#71717a')
				.attr('pointer-events', 'none')
				.text(d.label);
		});

		// Clamp tooltip position within SVG container
		function clampTooltip(clientX: number, clientY: number): { x: number; y: number } {
			const containerRect = svgEl!.getBoundingClientRect();
			const tooltipWidth = 192; // max-w-48 = 12rem
			const tooltipHeight = 80;
			let tx = clientX - containerRect.left + 12;
			let ty = clientY - containerRect.top - 8;
			if (tx + tooltipWidth > containerRect.width) tx = tx - tooltipWidth - 24;
			if (ty + tooltipHeight > containerRect.height) ty = containerRect.height - tooltipHeight - 8;
			if (ty < 0) ty = 8;
			return { x: tx, y: ty };
		}

		// Node interactions
		nodeSel
			.on('mouseover', (event, d: any) => {
				const { x, y } = clampTooltip(event.clientX, event.clientY);
				tooltip = { visible: true, x, y, node: d };
			})
			.on('mousemove', (event) => {
				const { x, y } = clampTooltip(event.clientX, event.clientY);
				tooltip = { ...tooltip, x, y };
			})
			.on('mouseout', () => {
				tooltip = { ...tooltip, visible: false };
			})
			.on('click', (event, d: any) => {
				event.stopPropagation();
				if (selectedNode === d.id) {
					selectedNode = null;
					updateHighlight(null, linkSel, nodeSel);
				} else {
					selectedNode = d.id;
					updateHighlight(d.id, linkSel, nodeSel);
				}
			})
			.on('keydown', (event, d: any) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					if (selectedNode === d.id) {
						selectedNode = null;
						updateHighlight(null, linkSel, nodeSel);
					} else {
						selectedNode = d.id;
						updateHighlight(d.id, linkSel, nodeSel);
					}
				} else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
					event.preventDefault();
					const adjacent = getAdjacentNodes(d.id, simEdges);
					if (adjacent.length > 0) {
						const currentFocused = document.activeElement;
						let currentIdx = -1;
						if (currentFocused) {
							nodeSel.each(function (nd: any, i: number) {
								if (this === currentFocused) {
									currentIdx = adjacent.indexOf(nd.id);
								}
							});
						}
						const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % adjacent.length : 0;
						focusNode(adjacent[nextIdx], nodeSel);
					}
				} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
					event.preventDefault();
					const adjacent = getAdjacentNodes(d.id, simEdges);
					if (adjacent.length > 0) {
						const currentFocused = document.activeElement;
						let currentIdx = -1;
						if (currentFocused) {
							nodeSel.each(function (nd: any, i: number) {
								if (this === currentFocused) {
									currentIdx = adjacent.indexOf(nd.id);
								}
							});
						}
						const nextIdx = currentIdx >= 0 ? (currentIdx - 1 + adjacent.length) % adjacent.length : adjacent.length - 1;
						focusNode(adjacent[nextIdx], nodeSel);
					}
				}
			});

		// Tick
		simulation.on('tick', () => {
			linkSel
				.attr('x1', (d: any) => d.source.x)
				.attr('y1', (d: any) => d.source.y)
				.attr('x2', (d: any) => d.target.x)
				.attr('y2', (d: any) => d.target.y);

			nodeSel.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
		});

		return { linkSel, nodeSel, simNodes, simEdges };
	}

	function getAdjacentNodes(nodeId: string, edges: any[]): string[] {
		const adjacent: string[] = [];
		for (const e of edges) {
			const src = typeof e.source === 'object' ? e.source.id : e.source;
			const tgt = typeof e.target === 'object' ? e.target.id : e.target;
			if (src === nodeId && !adjacent.includes(tgt)) adjacent.push(tgt);
			if (tgt === nodeId && !adjacent.includes(src)) adjacent.push(src);
		}
		return adjacent;
	}

	function focusNode(nodeId: string, nodeSel: d3.Selection<any, any, any, any>) {
		nodeSel
			.filter((d: any) => d.id === nodeId)
			.each(function () {
				(this as SVGGElement).focus();
			});
	}

	function updateHighlight(
		nodeId: string | null,
		linkSel: d3.Selection<any, any, any, any>,
		nodeSel: d3.Selection<any, any, any, any>
	) {
		if (!nodeId) {
			nodeSel.attr('opacity', 1);
			linkSel.attr('opacity', 1);
			return;
		}

		// Connected node IDs
		const connected = new Set<string>([nodeId]);
		linkSel.each((d: any) => {
			const src = typeof d.source === 'object' ? d.source.id : d.source;
			const tgt = typeof d.target === 'object' ? d.target.id : d.target;
			if (src === nodeId) connected.add(tgt);
			if (tgt === nodeId) connected.add(src);
		});

		nodeSel.attr('opacity', (d: any) => (connected.has(d.id) ? 1 : 0.1));
		linkSel.attr('opacity', (d: any) => {
			const src = typeof d.source === 'object' ? d.source.id : d.source;
			const tgt = typeof d.target === 'object' ? d.target.id : d.target;
			return src === nodeId || tgt === nodeId ? 1 : 0.05;
		});
	}

	// ---------------------------------------------------------------------------
	// Reactive: filter + search → rebuild
	// ---------------------------------------------------------------------------

	function getVisibleData() {
		let nodes = graphData.nodes;

		// Type filter
		if (activeFilter !== 'all') {
			nodes = nodes.filter((n) => n.type === activeFilter);
		}

		// Search filter
		const q = searchQuery.trim().toLowerCase();
		if (q) {
			nodes = nodes.filter((n) => n.id.toLowerCase().includes(q));
		}

		const visibleIds = new Set(nodes.map((n) => n.id));
		const edges = graphData.edges.filter(
			(e) => visibleIds.has(e.source) && visibleIds.has(e.target)
		);

		return { nodes, edges };
	}

	let graphRefs: ReturnType<typeof buildGraph> | null = null;
	let mounted = $state(false);
	let resizeTimer: ReturnType<typeof setTimeout>;

	onMount(() => {
		mounted = true;

		const ro = new ResizeObserver(() => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				if (simulationRef) simulationRef.stop();
				const { nodes, edges } = getVisibleData();
				graphRefs = buildGraph(nodes, edges);
			}, 200);
		});
		ro.observe(svgEl!.parentElement!);

		return () => {
			clearTimeout(resizeTimer);
			ro.disconnect();
			simulationRef?.stop();
		};
	});

	$effect(() => {
		const _f = activeFilter;
		const _q = searchQuery;
		if (!mounted || !svgEl) return;
		if (simulationRef) simulationRef.stop();
		const { nodes, edges } = getVisibleData();
		graphRefs = buildGraph(nodes, edges);
		selectedNode = null;
	});

	$effect(() => {
		const nodeId = selectedNode;
		if (!nodeId) {
			liveMessage = '';
			return;
		}
		const node = graphData.nodes.find((n) => n.id === nodeId);
		if (node) {
			const connections = graphData.edges.filter(
				(e) => e.source === nodeId || e.target === nodeId
			).length;
			liveMessage = `${node.label}, ${node.type}, ${connections} connections`;
		}
	});
</script>

<!-- ============================================================ -->
<!-- Layout -->
<!-- ============================================================ -->
<div class="flex flex-col h-screen bg-zinc-950">
	<!-- Header -->
	<header class="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
		<div>
			<h1 class="text-zinc-100 font-semibold text-base tracking-tight">Dependency Graph</h1>
			<p class="text-zinc-500 text-xs mt-0.5">
				{agentCount} agents · {skillCount} skills · {guideCount} guides
			</p>
		</div>

		<!-- Controls -->
		<div class="flex items-center gap-3">
			<!-- Search -->
			<div class="relative">
				<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs pointer-events-none">⌘K</span>
				<input
					type="text"
					placeholder="Search nodes..."
					bind:value={searchQuery}
					class="bg-zinc-900 border border-zinc-700 rounded text-zinc-200 text-xs pl-8 pr-3 py-1.5 w-44 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
					aria-label="Search nodes"
				/>
			</div>

			<!-- Filter buttons -->
			<div class="flex gap-1" role="group" aria-label="Filter by node type">
				{#each (['all', 'agent', 'skill', 'guide'] as const) as filter}
					<button
						onclick={() => (activeFilter = filter)}
						class="px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize {activeFilter === filter
							? 'bg-zinc-700 text-zinc-100'
							: 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}"
						aria-pressed={activeFilter === filter}
					>
						{filter}
					</button>
				{/each}
			</div>
		</div>
	</header>

	<!-- Graph canvas -->
	<div class="relative flex-1 overflow-hidden">
		<a
			href="#after-graph"
			class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-zinc-800 focus:text-zinc-100 focus:px-4 focus:py-2 focus:rounded focus:top-2 focus:left-2"
		>Skip graph</a>
		<svg
			bind:this={svgEl}
			class="w-full h-full"
			role="application"
			aria-label="Dependency graph visualization. Use Tab to navigate nodes, Enter or Space to select, Arrow keys to move between connected nodes."
		></svg>
		<div id="after-graph" tabindex="-1"></div>

		<!-- Tooltip -->
		{#if tooltip.visible && tooltip.node}
			<div
				class="pointer-events-none absolute z-20 bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-xs shadow-xl max-w-48"
				style="left: {tooltip.x}px; top: {tooltip.y}px"
				role="tooltip"
			>
				<div class="font-semibold text-zinc-100 truncate">{tooltip.node.label}</div>
				<div class="text-zinc-400 mt-0.5 capitalize">{tooltip.node.type}</div>
				{#if tooltip.node.domain}
					<div class="text-zinc-500 mt-0.5">domain: {tooltip.node.domain}</div>
				{/if}
				{#if tooltip.node.scope}
					<div class="text-zinc-500 mt-0.5">scope: {tooltip.node.scope}</div>
				{/if}
				{#if tooltip.node.model}
					<div class="text-zinc-500 mt-0.5">model: {tooltip.node.model}</div>
				{/if}
			</div>
		{/if}

		<div aria-live="polite" class="sr-only">{liveMessage}</div>

		<!-- Legend -->
		<div
			class="absolute top-4 right-4 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-lg px-3 py-3 text-xs space-y-2"
			aria-label="Graph legend"
		>
			<div class="text-zinc-500 font-semibold uppercase tracking-wider text-[10px] mb-1">Legend</div>

			<!-- Node types -->
			<div class="space-y-1.5">
				<div class="flex items-center gap-2">
					<svg width="12" height="12" aria-hidden="true">
						<circle cx="6" cy="6" r="5" fill="#71717a" />
					</svg>
					<span class="text-zinc-400">Agent</span>
				</div>
				<div class="flex items-center gap-2">
					<svg width="12" height="12" aria-hidden="true">
						<rect x="1" y="1" width="10" height="10" rx="1.5" fill="#10b981" />
					</svg>
					<span class="text-zinc-400">Skill</span>
				</div>
				<div class="flex items-center gap-2">
					<svg width="12" height="12" aria-hidden="true">
						<rect x="1" y="1" width="10" height="10" transform="rotate(45,6,6)" fill="#a78bfa" />
					</svg>
					<span class="text-zinc-400">Guide</span>
				</div>
			</div>

			<!-- Divider -->
			<div class="border-t border-zinc-800 my-1"></div>

			<!-- Edge types -->
			<div class="space-y-1.5">
				<div class="flex items-center gap-2">
					<svg width="20" height="8" aria-hidden="true">
						<line x1="0" y1="4" x2="20" y2="4" stroke="#3f3f46" stroke-width="1.5" stroke-opacity="0.8" />
					</svg>
					<span class="text-zinc-400">requires</span>
				</div>
				<div class="flex items-center gap-2">
					<svg width="20" height="8" aria-hidden="true">
						<line x1="0" y1="4" x2="20" y2="4" stroke="#3f3f46" stroke-width="1.5" stroke-dasharray="4,3" stroke-opacity="0.8" />
					</svg>
					<span class="text-zinc-400">routes to</span>
				</div>
			</div>

			<!-- Domain colors -->
			<div class="border-t border-zinc-800 my-1"></div>
			<div class="text-zinc-500 font-semibold uppercase tracking-wider text-[10px] mb-1">Domains</div>
			<div class="space-y-1">
				{#each Object.entries(domainColor) as [domain, color]}
					<div class="flex items-center gap-2">
						<span class="inline-block w-2 h-2 rounded-full shrink-0" style="background:{color}"></span>
						<span class="text-zinc-500 text-[10px] capitalize">{domain}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Empty state -->
		{#if graphData.nodes.length === 0}
			<div class="absolute inset-0 flex items-center justify-center">
				<div class="text-center">
					<div class="text-4xl mb-3 opacity-20">◎</div>
					<div class="text-zinc-500 text-sm">No graph data available</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
  :global(.node:focus-visible) {
    outline: none;
  }
  :global(.node:focus-visible circle),
  :global(.node:focus-visible rect) {
    stroke: #60a5fa;
    stroke-width: 3;
    filter: drop-shadow(0 0 4px rgba(96, 165, 250, 0.5));
  }
</style>
