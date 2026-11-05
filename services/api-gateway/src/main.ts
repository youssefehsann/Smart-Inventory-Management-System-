import 'dotenv/config';
import { boot } from '@smart/common';
import { AppModule } from './module';
void boot(AppModule, 'api-gateway', 4000, async () => true);
