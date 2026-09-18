export function isCareerPlatform(platform: string): boolean {
  return platform.startsWith("career");
}

export function jobDetailPath(job: { id: number; platform: string }): string {
  return isCareerPlatform(job.platform) ? `/career-jobs/${job.id}` : `/jobs/${job.id}`;
}
