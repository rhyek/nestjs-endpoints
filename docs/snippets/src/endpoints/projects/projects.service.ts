import { Injectable, NotFoundException } from '@nestjs/common';

export type Project = { id: string; name: string; ownerId: number };

@Injectable()
export class ProjectsService {
  private readonly projects: Project[] = [];

  listFor(userId: number): Project[] {
    return this.projects.filter((project) => project.ownerId === userId);
  }

  find(id: string, userId: number): Project {
    const project = this.listFor(userId).find((candidate) => candidate.id === id);
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

  completeTask(projectId: string, taskId: number, userId: number): { done: boolean } {
    this.find(projectId, userId);
    return { done: taskId > 0 };
  }
}
