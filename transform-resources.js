"use strict";

const builders = require("./resource-builders");

module.exports.transformDdbTables = function (serverless) {
  const resources = serverless.service.resources.Resources;

  let addAutoScaleRole = false;

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
        resources[`${resName}${scalingOptions.dim}ScalableTarget`] = builders.scalableTargetBuilder(scalingOptions);
        resources[`${resName}${scalingOptions.dim}ScalingPolicy`] = builders.scalingPolicyBuilder(scalingOptions);
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
          resources[`${resName}Index${indexResName}${scalingOptions.dim}ScalableTarget`] = builders.scalableTargetBuilder(scalingOptions);
          resources[`${resName}Index${indexResName}${scalingOptions.dim}ScalingPolicy`] = builders.scalingPolicyBuilder(scalingOptions);
        });
      });
    });

  if (addAutoScaleRole) {
    resources.DdbAutoScaleRole = builders.ddbAutoScaleRoleBuilder();
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