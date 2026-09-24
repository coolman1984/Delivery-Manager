import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { StoreSelfController } from './store-self.controller';

@Module({ controllers: [CatalogController, StoreSelfController] })
export class CatalogModule {}
