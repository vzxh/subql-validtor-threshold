import {
  SubstrateExtrinsic,
  SubstrateEvent,
  SubstrateBlock,
} from "@subql/types";
import { StarterEntity, ValidatorThreshold } from "../types";
import {
  Balance,
  ActiveEraInfo,
  EraIndex,
  Exposure,
} from "@polkadot/types/interfaces";
import { Option } from "@polkadot/types";

export async function handleEvent({ block }: SubstrateEvent): Promise<void> {
  if (!api.query.staking.activeEra) {
    return;
  }

  const [activeEra] = await api.queryMulti<
    [Option<ActiveEraInfo>, Option<EraIndex>]
  >([
    api.query.staking.activeEra,
    //   api.query.staking.currentEra,
  ]);

  if (activeEra.isEmpty) {
    return;
  }

  const record = new ValidatorThreshold(activeEra.unwrap().index.toString());
  const validators = await api.query.session.validators();
  const exposureInfos = await api.query.staking.erasStakers.multi<Exposure>(
    validators.map((validator) => [activeEra.unwrap().index, validator])
  );
  const thresholdValidotor = exposureInfos.reduce<{
    accountId: string;
    total: Balance;
  }>((acc, exposure, index) => {
    if (!acc || exposure.total.unwrap().lt(acc.total)) {
      return {
        accountId: validators[index].toString(),
        total: exposure.total.unwrap(),
      };
    }
    return acc;
  }, undefined);

  record.startBlock = block.block.header.number.toNumber();
  record.timestamp = block.timestamp;
  record.validatorWithLeaseBond = thresholdValidotor.accountId;
  record.leastStaked = thresholdValidotor.total.toBigInt();
  record.totalStaked = (
    await api.query.staking.erasTotalStake(activeEra.unwrap().index)
  ).toBigInt();
  record.maxNominatorRewardedPerValidator =
    api.consts.staking.maxNominatorRewardedPerValidator?.toNumber();
  record.totalValidators = validators.length;

  await record.save();
}
