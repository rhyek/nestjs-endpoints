import { Injectable, NotFoundException } from '@nestjs/common';

type Recipe = {
  id: number;
  name: string;
  ingredients: string[];
};

@Injectable()
export class RecipesRepository {
  recipes: Recipe[] = [];

  add(name: string) {
    const lastid = this.recipes.slice(-1)[0]?.id ?? 0;
    const nextid = lastid + 1;
    const newrecipe: Recipe = {
      id: nextid,
      name,
      ingredients: [],
    };
    this.recipes.push(newrecipe);
    return newrecipe;
  }

  find(id: number) {
    const recipe = this.recipes.find((r) => r.id === id);
    if (!recipe) {
      throw new NotFoundException(`Recipe ${id} not found`);
    }
    return recipe;
  }

  update(id: number, patch: { name?: string; ingredients?: string[] }) {
    const recipe = this.find(id);
    if (patch.name !== undefined) recipe.name = patch.name;
    if (patch.ingredients !== undefined)
      recipe.ingredients = patch.ingredients;
    return recipe;
  }

  remove(id: number) {
    const idx = this.recipes.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new NotFoundException(`Recipe ${id} not found`);
    }
    const [removed] = this.recipes.splice(idx, 1);
    return removed;
  }
}
