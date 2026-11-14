#!/bin/bash

# Wait for LocalStack to be ready
awslocal sqs create-queue --queue-name wagering-queue --region us-east-1
awslocal sqs create-queue --queue-name wagering-dlq --region us-east-1

# Set DLQ redrive policy
QUEUE_URL=$(awslocal sqs get-queue-url --queue-name wagering-queue --region us-east-1 --query 'QueueUrl' --output text)
DLQ_URL=$(awslocal sqs get-queue-url --queue-name wagering-dlq --region us-east-1 --query 'QueueUrl' --output text)
DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url $DLQ_URL --attribute-names QueueArn --region us-east-1 --query 'Attributes.QueueArn' --output text)

awslocal sqs set-queue-attributes \
  --queue-url $QUEUE_URL \
  --attributes "{\"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" \
  --region us-east-1

echo "SQS queues created and configured successfully"