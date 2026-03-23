import type { LayoutServerLoad } from './$types';
import { getProjectRoot } from '$lib/server/data';
import { findProjectsForServe } from '$lib/server/projects';

export const load: LayoutServerLoad = async ({ url }) => {
	const projects = await findProjectsForServe();
	const selectedSlug = url.searchParams.get('project');

	let root: string;
	let projectNotFound = false;
	if (selectedSlug) {
		const match = projects.find((p) => p.slug === selectedSlug);
		if (match) {
			root = match.path;
		} else {
			root = await getProjectRoot();
			projectNotFound = true;
		}
	} else {
		root = await getProjectRoot();
	}

	return {
		projects,
		selectedProject: selectedSlug,
		root,
		projectNotFound
	};
};
