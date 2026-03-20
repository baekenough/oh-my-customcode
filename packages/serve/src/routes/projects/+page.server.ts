import type { PageServerLoad, Actions } from './$types';
import { findProjectsForServe, invalidateProjectCache } from '$lib/server/projects';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fail } from '@sveltejs/kit';

const execAsync = promisify(exec);

export const load: PageServerLoad = async () => {
	const projects = await findProjectsForServe();
	return { projects };
};

export const actions: Actions = {
	update: async ({ request }) => {
		const formData = await request.formData();
		const projectPath = formData.get('path') as string;

		if (!projectPath) {
			return fail(400, { error: 'Project path is required' });
		}

		// Security: validate path doesn't contain shell injection characters
		if (/[;&|`$(){}]/.test(projectPath)) {
			return fail(400, { error: 'Invalid project path' });
		}

		try {
			const { stdout, stderr } = await execAsync(`npx oh-my-customcode update`, {
				cwd: projectPath,
				timeout: 120000,
				maxBuffer: 1024 * 1024
			});

			// Invalidate cache so next load reflects updated version
			invalidateProjectCache();

			return {
				success: true,
				project: projectPath,
				output: stdout || stderr || 'Update completed'
			};
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			return fail(500, { error: `Update failed: ${msg}` });
		}
	},

	updateAll: async () => {
		try {
			const { stdout, stderr } = await execAsync(`npx oh-my-customcode update --all`, {
				timeout: 300000,
				maxBuffer: 5 * 1024 * 1024
			});

			// Invalidate cache so next load reflects updated versions
			invalidateProjectCache();

			return {
				success: true,
				output: stdout || stderr || 'Batch update completed'
			};
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			return fail(500, { error: `Batch update failed: ${msg}` });
		}
	}
};
