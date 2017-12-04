"use strict";

module.exports.ddbAutoScaleRoleBuilder = function () {
  return {
    Type: "AWS::IAM::Role",

    Properties: {
      //RoleName: "DdbAutoScaleRole",

      AssumeRolePolicyDocument: {
        Version: "2012-10-17",

        Statement: [{
          Effect: "Allow",
          Principal: {
            Service: ["application-autoscaling.amazonaws.com"]
          },
          Action: ["sts:AssumeRole"]
        }]
      },

      Path: "/",

      Policies: [{
        PolicyName: "root",

        PolicyDocument: {
          Version: "2012-10-17",

          Statement: [{
            Effect: "Allow",
            Resource: "*",
            Action: [
              "dynamodb:DescribeTable",
              "dynamodb:UpdateTable",
              "cloudwatch:PutMetricAlarm",
              "cloudwatch:DescribeAlarms",
              "cloudwatch:GetMetricStatistics",
              "cloudwatch:SetAlarmState",
              "cloudwatch:DeleteAlarms"
            ]
          }]
        }
      }]
    }
  };
};

module.exports.scalableTargetBuilder = function (options) {
  return {
    Type: "AWS::ApplicationAutoScaling::ScalableTarget",
    Properties: {
      MinCapacity: options.MinProvisionedUnits,
      MaxCapacity: options.MaxProvisionedUnits,
      RoleARN: { "Fn::GetAtt": "DdbAutoScaleRole.Arn" },
      ResourceId: module.exports.resourceIdBuilder(options),
      ScalableDimension: `dynamodb:${options.index ? "index" : "table"}:${options.dim}CapacityUnits`,
      ServiceNamespace: "dynamodb"
    }
  };
};

module.exports.scalingPolicyBuilder = function (options) {
  return {
    Type: "AWS::ApplicationAutoScaling::ScalingPolicy",
    Properties: {
      PolicyName: !options.index ?
        `${options.table}${options.dim}AutoScalingPolicy` :
        `${options.table}Index${module.exports.resourceNameBuilder(options.index)}${options.dim}AutoScalingPolicy`,
      PolicyType: "TargetTrackingScaling",
      ScalingTargetId: {
        Ref: !options.index ?
          `${options.table}${options.dim}ScalableTarget` :
          `${options.table}Index${module.exports.resourceNameBuilder(options.index)}${options.dim}ScalableTarget`
      },
      TargetTrackingScalingPolicyConfiguration: {
        TargetValue: parseFloat(options.TargetUtilization) || 70,
        ScaleInCooldown: parseFloat(options.ScaleInCooldown) || 60,
        ScaleOutCooldown: parseFloat(options.ScaleOutCooldown) || 60,
        PredefinedMetricSpecification: {
          PredefinedMetricType: `DynamoDB${options.dim}CapacityUtilization`
        }
      }
    }
  };
};

module.exports.resourceIdBuilder = function (options) {
  const components = ["table", { Ref: options.table }];

  if (options.index) {
    components.push("index");
    components.push(options.index);
  }

  return { "Fn::Join": ["/", components] };
};

module.exports.resourceNameBuilder = function (name) {
  return name.split(/[^a-zA-Z0-9]/)
    .map(x => `${x[0].toUpperCase()}${x.substring(1)}`)
    .join("");
};