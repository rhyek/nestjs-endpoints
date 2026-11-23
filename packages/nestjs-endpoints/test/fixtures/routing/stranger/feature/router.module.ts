import { Module } from '@nestjs/common';

// Named as a router file, and default-exports a module that is no router.
export default class FeatureModule {}
Module({})(FeatureModule);
