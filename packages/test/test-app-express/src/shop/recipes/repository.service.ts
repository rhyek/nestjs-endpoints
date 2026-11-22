import { Injectable } from '@nestjs/common';

type Recipe = { id: number; name: string };

@Injectable()
export class RecipesRepository {
  recipes: Recipe[] = [];
  add(name: string) {
    const id = (this.recipes.slice(-1)[0]?.id ?? 0) + 1;
    const r = { id, name };
    this.recipes.push(r);
    return r;
  }
  list() {
    return this.recipes;
  }
}
