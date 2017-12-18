"use strict";

const builders = require("./resource-builders");

module.exports.transformDdbTables = function (serverless) {
  const resources = serverless.service.resources.Resources;

  let addAutoScaleRole = false;
  let allConditions = new Set();

  Object.getOwnPropertyNames(resources)
    .filter(resName => resources[resName].Type === "AWS::DynamoDB::Table")
    .forEach(resName => {
      const table = resources[resName];
      const scaleConfig = table.Properties.AutoScaling;

      if (!scaleConfig) return;
      delete table.Properties.AutoScaling;
      addAutoScaleRole = true;

      /* add table read/write scaling resources */ [
        getScalingOptions(resName, "", "Read", scaleConfig.ReadCapacity, table.Properties.ProvisionedThroughput),
        getScalingOptions(resName, "", "Write", scaleConfig.WriteCapacity, table.Properties.ProvisionedThroughput)
      ].filter(x => x).forEach(scalingOptions => {
        const targetName = `${resName}${scalingOptions.dim}ScalableTarget`;
        const policyName = `${resName}${scalingOptions.dim}ScalingPolicy`;

        const target = builders.scalableTargetBuilder(scalingOptions);
        const policy = builders.scalingPolicyBuilder(scalingOptions);

        target.DependsOn = resName;
        policy.DependsOn = targetName;

        if (table.Condition) {
          allConditions.add(table.Condition);
          target.Condition = table.Condition;
          policy.Condition = table.Condition;
        }

        resources[targetName] = target;
        resources[policyName] = policy;
      });

      (table.Properties.GlobalSecondaryIndexes || []).forEach(index => {
        const scaleConfig = index.AutoScaling;

        if (!scaleConfig) return;
        delete index.AutoScaling;
        addAutoScaleRole = true;

        /* add GSI read/write scaling resources */ [
          getScalingOptions(resName, index.IndexName, "Read", scaleConfig.ReadCapacity, index.ProvisionedThroughput),
          getScalingOptions(resName, index.IndexName, "Write", scaleConfig.WriteCapacity, index.ProvisionedThroughput)
        ].filter(x => x).forEach(scalingOptions => {
          const indexResName = builders.resourceNameBuilder(index.IndexName);

          const targetName = `${resName}Index${indexResName}${scalingOptions.dim}ScalableTarget`;
          const policyName = `${resName}Index${indexResName}${scalingOptions.dim}ScalingPolicy`;

          const target = builders.scalableTargetBuilder(scalingOptions);
          const policy = builders.scalingPolicyBuilder(scalingOptions);

          target.DependsOn = resName;
          policy.DependsOn = targetName;

          if (table.Condition) {
            target.Condition = table.Condition;
            policy.Condition = table.Condition;
          }

          resources[targetName] = target;
          resources[policyName] = policy;
        });
      });
    });

  if (addAutoScaleRole) {
    resources.DdbAutoScaleRole = builders.ddbAutoScaleRoleBuilder();
    allConditions = Array.from(allConditions);

    // if all tables have same condition set it for role as well
    if (allConditions.length === 1) {
      resources.DdbAutoScaleRole.Condition = allConditions[0];
    }
  }
};

function getScalingOptions(table, index, dim, scalingConfig, provisionedThroughput) {
  return scalingConfig ? Object.assign({
    table, index, dim,
    ScaleInCooldown: 60,
    ScaleOutCooldown: 60,
    TargetUtilization: 70,
    MinProvisionedUnits: provisionedThroughput[`${dim}CapacityUnits`],
    MaxProvisionedUnits: provisionedThroughput[`${dim}CapacityUnits`] * 100
  }, scalingConfig) : undefined;
}
