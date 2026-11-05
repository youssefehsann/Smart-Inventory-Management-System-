import 'dotenv/config';
import { boot } from '@smart/common';
import { AppModule } from './module';
void boot(AppModule, 'catalog-service', 4002, async () => true);
