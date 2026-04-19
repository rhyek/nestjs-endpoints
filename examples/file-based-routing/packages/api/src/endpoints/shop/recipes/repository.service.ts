import { Injectable } from '@nestjs/common';

export type Recipe = { id: number; name: string };

@Injectable()
export class RecipesRepository {
  private recipes: Recipe[] = [];

  list() {
    return this.recipes;
  }

  add(name: string): Recipe {
    const id = (this.recipes.slice(-1)[0]?.id ?? 0) + 1;
    const recipe = { id, name };
    this.recipes.push(recipe);
    return recipe;
  }
}
