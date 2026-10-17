import { describe, expect, test } from 'vitest';
import { stripNamespaceFromFlatName } from './name-transform.js';

describe('stripNamespaceFromFlatName', () => {
  test('returns the flat name unchanged when chain is empty', () => {
    expect(stripNamespaceFromFlatName('userCreate', [])).toBe(
      'userCreate',
    );
    expect(stripNamespaceFromFlatName('useUserCreate', [])).toBe(
      'useUserCreate',
    );
  });

  test('strips a single-segment chain from a plain function name', () => {
    expect(stripNamespaceFromFlatName('shopProductList', ['shop'])).toBe(
      'productList',
    );
  });

  test('strips a single-segment chain while preserving the use prefix', () => {
    expect(
      stripNamespaceFromFlatName('useShopProductList', ['shop']),
    ).toBe('useProductList');
  });

  test('strips a multi-segment chain from a use-prefixed name', () => {
    expect(
      stripNamespaceFromFlatName('useShopCatalogFeaturedWeekUpdate', [
        'shop',
        'catalog',
        'featured',
      ]),
    ).toBe('useWeekUpdate');
  });

  test('strips a multi-segment chain from a plain function name', () => {
    expect(
      stripNamespaceFromFlatName('shopCatalogFeaturedWeekUpdate', [
        'shop',
        'catalog',
        'featured',
      ]),
    ).toBe('weekUpdate');
  });

  test('handles hyphenated segments (kebab → pascal)', () => {
    // segment 'user-profile' → token 'UserProfile'
    expect(
      stripNamespaceFromFlatName('userProfileAvatarGet', ['user-profile']),
    ).toBe('avatarGet');
  });

  test('handles multi-word pascal segments in the chain', () => {
    expect(
      stripNamespaceFromFlatName('userProfileAccountSettingsUpdate', [
        'user-profile',
        'account-settings',
      ]),
    ).toBe('update');
  });

  test('leaves name unchanged when prefix does not match the chain', () => {
    // chain expects 'Shop...', body starts with 'Foo...'
    expect(stripNamespaceFromFlatName('fooBarBaz', ['shop'])).toBe(
      'fooBarBaz',
    );
    expect(stripNamespaceFromFlatName('useFooBarBaz', ['shop'])).toBe(
      'useFooBarBaz',
    );
  });

  test('leaves name unchanged on partial-token match (not at word boundary)', () => {
    // chain 'user' produces prefix 'User'; body 'UsernameList' starts
    // with 'User' but the next char is lowercase 'n' — not a word
    // boundary, so it's treated as a non-match and left as-is.
    expect(stripNamespaceFromFlatName('usernameList', ['user'])).toBe(
      'usernameList',
    );
  });

  test('leaves name unchanged when only a prefix of the chain matches', () => {
    // Body matches 'Shop' but not 'ShopCatalog'.
    expect(
      stripNamespaceFromFlatName('shopProductList', ['shop', 'catalog']),
    ).toBe('shopProductList');
  });

  test('returns original when stripping would consume the whole name', () => {
    // Lenient: a full match leaves nothing to strip, so fall back to
    // the flat name unchanged (same rule as no-match). Consumers can
    // rename the endpoint if they want a cleaner leaf name.
    expect(stripNamespaceFromFlatName('shop', ['shop'])).toBe('shop');
    expect(stripNamespaceFromFlatName('useShop', ['shop'])).toBe(
      'useShop',
    );
    expect(
      stripNamespaceFromFlatName('shopRecipes', ['shop', 'recipes']),
    ).toBe('shopRecipes');
  });
});
