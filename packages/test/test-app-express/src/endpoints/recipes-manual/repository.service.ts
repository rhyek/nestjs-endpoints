import { Injectable } from '@nestjs/common';

type Recipe = {
  id: number;
  name: string;
};

@Injectable()
export class RecipesRepository {
  recipes: Recipe[] = [];

  add(name: string) {
    const lastid = this.recipes.slice(-1)[0]?.id ?? 0;
    const nextid = lastid + 1;
    const newrecipe = {
      id: nextid,
      name,
      manual: true,
    };
    this.recipes.push(newrecipe);
    return newrecipe;
  }
}
