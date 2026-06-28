import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorCeoLayersToCanonical20260427235500 implements MigrationInterface {
  name = 'RefactorCeoLayersToCanonical20260427235500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE marketplace_agent_key_bindings
      SET ceo_layer = CASE ceo_layer
        WHEN 'classifier' THEN 'strategy'
        WHEN 'light' THEN 'orchestration'
        WHEN 'heavy' THEN 'supervision'
        ELSE ceo_layer
      END
      WHERE ceo_layer IN ('classifier', 'light', 'heavy')
    `);

    await queryRunner.query(`
      UPDATE marketplace_agents
      SET ceo_layer_config =
        (
          (ceo_layer_config - 'classifier' - 'light' - 'heavy')
          || CASE WHEN ceo_layer_config ? 'classifier'
            THEN jsonb_build_object('strategy', ceo_layer_config->'classifier')
            ELSE '{}'::jsonb END
          || CASE WHEN ceo_layer_config ? 'light'
            THEN jsonb_build_object('orchestration', ceo_layer_config->'light')
            ELSE '{}'::jsonb END
          || CASE WHEN ceo_layer_config ? 'heavy'
            THEN jsonb_build_object('supervision', ceo_layer_config->'heavy')
            ELSE '{}'::jsonb END
        )
      WHERE ceo_layer_config ?| array['classifier','light','heavy']
    `);

    await queryRunner.query(`
      UPDATE company_ceo_layer_configs
      SET ceo_layer_config =
        (
          (ceo_layer_config - 'classifier' - 'light' - 'heavy')
          || CASE WHEN ceo_layer_config ? 'classifier'
            THEN jsonb_build_object('strategy', ceo_layer_config->'classifier')
            ELSE '{}'::jsonb END
          || CASE WHEN ceo_layer_config ? 'light'
            THEN jsonb_build_object('orchestration', ceo_layer_config->'light')
            ELSE '{}'::jsonb END
          || CASE WHEN ceo_layer_config ? 'heavy'
            THEN jsonb_build_object('supervision', ceo_layer_config->'heavy')
            ELSE '{}'::jsonb END
        )
      WHERE ceo_layer_config ?| array['classifier','light','heavy']
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE marketplace_agent_key_bindings
      SET ceo_layer = CASE ceo_layer
        WHEN 'strategy' THEN 'classifier'
        WHEN 'orchestration' THEN 'light'
        WHEN 'supervision' THEN 'heavy'
        ELSE ceo_layer
      END
      WHERE ceo_layer IN ('strategy', 'orchestration', 'supervision')
    `);

    await queryRunner.query(`
      UPDATE marketplace_agents
      SET ceo_layer_config =
        (
          (ceo_layer_config - 'strategy' - 'orchestration' - 'supervision')
          || CASE WHEN ceo_layer_config ? 'strategy'
            THEN jsonb_build_object('classifier', ceo_layer_config->'strategy')
            ELSE '{}'::jsonb END
          || CASE WHEN ceo_layer_config ? 'orchestration'
            THEN jsonb_build_object('light', ceo_layer_config->'orchestration')
            ELSE '{}'::jsonb END
          || CASE WHEN ceo_layer_config ? 'supervision'
            THEN jsonb_build_object('heavy', ceo_layer_config->'supervision')
            ELSE '{}'::jsonb END
        )
      WHERE ceo_layer_config ?| array['strategy','orchestration','supervision']
    `);

    await queryRunner.query(`
      UPDATE company_ceo_layer_configs
      SET ceo_layer_config =
        (
          (ceo_layer_config - 'strategy' - 'orchestration' - 'supervision')
          || CASE WHEN ceo_layer_config ? 'strategy'
            THEN jsonb_build_object('classifier', ceo_layer_config->'strategy')
            ELSE '{}'::jsonb END
          || CASE WHEN ceo_layer_config ? 'orchestration'
            THEN jsonb_build_object('light', ceo_layer_config->'orchestration')
            ELSE '{}'::jsonb END
          || CASE WHEN ceo_layer_config ? 'supervision'
            THEN jsonb_build_object('heavy', ceo_layer_config->'supervision')
            ELSE '{}'::jsonb END
        )
      WHERE ceo_layer_config ?| array['strategy','orchestration','supervision']
    `);
  }
}
