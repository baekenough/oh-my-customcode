#!/usr/bin/env bun
import { Command } from 'commander';
import { analyzeCommand } from './analyze.cmd.js';
import { collectCommand } from './collect.cmd.js';
import { listCommand } from './list.cmd.js';
import { migrateCommand } from './migrate.cmd.js';
import { showCommand } from './show.cmd.js';

const program = new Command()
  .name('eval-core')
  .description('Agent evaluation engine for oh-my-customcode')
  .version('0.1.0');

program.addCommand(collectCommand);
program.addCommand(migrateCommand);
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(analyzeCommand);

program.parse();
