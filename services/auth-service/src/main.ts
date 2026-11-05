import 'dotenv/config';
import { boot } from '@smart/common';
import { AppModule } from './module';
void boot(AppModule, 'auth-service', 4001, async () => true);
