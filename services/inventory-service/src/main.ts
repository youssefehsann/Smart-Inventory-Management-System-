import 'dotenv/config';
import { boot } from '@smart/common';
import { AppModule } from './module';
void boot(AppModule, 'inventory-service', 4003, async () => true);
