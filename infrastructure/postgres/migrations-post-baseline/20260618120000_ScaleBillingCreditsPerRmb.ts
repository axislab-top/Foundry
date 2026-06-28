import { MigrationInterface, QueryRunner } from 'typeorm';

const SCALE = 1_000_000;

/**
 * 汇率调整：1 元 = 1 Credit → 1 元 = 1,000,000 Credit。
 * 将存量金额类字段同比放大，保持人民币语义不变；之后计费仍以 Credit 入账。
 */
export class ScaleBillingCreditsPerRmb20260618120000 implements MigrationInterface {
  name = 'ScaleBillingCreditsPerRmb20260618120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE model_pricing
      SET
        input_price_per_million = input_price_per_million * ${SCALE},
        output_price_per_million = output_price_per_million * ${SCALE},
        embedding_price_per_million = embedding_price_per_million * ${SCALE},
        skill_base_fee = skill_base_fee * ${SCALE}
    `);

    await queryRunner.query(`
      UPDATE budgets
      SET
        total_amount = total_amount * ${SCALE},
        used_amount = used_amount * ${SCALE}
      WHERE scope = 'company'
    `);

    await queryRunner.query(`
      UPDATE billing_records
      SET cost = cost * ${SCALE}
    `);

    await queryRunner.query(`
      UPDATE daily_agent_usage
      SET
        input_cost = input_cost * ${SCALE},
        output_cost = output_cost * ${SCALE},
        total_cost = total_cost * ${SCALE}
    `);

    await queryRunner.query(`
      UPDATE billing_recharge_orders
      SET amount = amount * ${SCALE}
    `);

    await queryRunner.query(`
      UPDATE billing_balance_credits
      SET
        amount = amount * ${SCALE},
        budget_total_after = budget_total_after * ${SCALE}
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE billing_balance_credits
      SET
        amount = amount / ${SCALE},
        budget_total_after = budget_total_after / ${SCALE}
    `);

    await queryRunner.query(`
      UPDATE billing_recharge_orders
      SET amount = amount / ${SCALE}
    `);

    await queryRunner.query(`
      UPDATE daily_agent_usage
      SET
        input_cost = input_cost / ${SCALE},
        output_cost = output_cost / ${SCALE},
        total_cost = total_cost / ${SCALE}
    `);

    await queryRunner.query(`
      UPDATE billing_records
      SET cost = cost / ${SCALE}
    `);

    await queryRunner.query(`
      UPDATE budgets
      SET
        total_amount = total_amount / ${SCALE},
        used_amount = used_amount / ${SCALE}
      WHERE scope = 'company'
    `);

    await queryRunner.query(`
      UPDATE model_pricing
      SET
        input_price_per_million = input_price_per_million / ${SCALE},
        output_price_per_million = output_price_per_million / ${SCALE},
        embedding_price_per_million = embedding_price_per_million / ${SCALE},
        skill_base_fee = skill_base_fee / ${SCALE}
    `);
  }
}
