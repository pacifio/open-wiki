import chalk from 'chalk';
import { getAllProjects, getProjectStats } from '../storage/db.js';
import { formatDistanceToNow } from 'date-fns';

export function listProjects(): void {
  const projects = getAllProjects();

  if (projects.length === 0) {
    console.log(chalk.yellow('\nNo projects indexed yet. Run `ow <path>` to get started.\n'));
    return;
  }

  console.log(chalk.bold(`\nIndexed projects (${projects.length}):\n`));
  for (const project of projects) {
    const stats = getProjectStats(project.id);
    const lastIndexed = project.last_indexed
      ? formatDistanceToNow(new Date(project.last_indexed), { addSuffix: true })
      : 'never';

    console.log(`  ${chalk.cyan(chalk.bold(project.name))}`);
    console.log(`    ${chalk.gray(project.path)}`);
    console.log(
      `    ${chalk.gray(`${stats.fileCount} files · ${stats.symbolCount} symbols · indexed ${lastIndexed}`)}`
    );
    console.log(`    ${chalk.blue(`http://localhost:8383/docs/${project.name}/wiki`)}`);
    console.log();
  }
}
