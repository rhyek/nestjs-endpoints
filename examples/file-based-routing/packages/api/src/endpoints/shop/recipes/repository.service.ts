import { Injectable, NotFoundException } from '@nestjs/common';

export type Recipe = { id: number; name: string };

@Injectable()
export class RecipesRepository {
  private recipes: Recipe[] = [];

  list() {
    return this.recipes;
  }

  find(id: number): Recipe {
    const recipe = this.recipes.find((r) => r.id === id);
    if (!recipe) throw new NotFoundException(`Recipe ${id} not found`);
    return recipe;
  }

  add(name: string): Recipe {
    const id = (this.recipes.slice(-1)[0]?.id ?? 0) + 1;
    const recipe = { id, name };
    this.recipes.push(recipe);
    return recipe;
  }

  rename(id: number, name: string): Recipe {
    const recipe = this.find(id);
    recipe.name = name;
    return recipe;
  }
}
