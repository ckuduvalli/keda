import * as fs from 'fs'
import * as sh from 'shelljs'
import * as tmp from 'tmp'
import test from 'ava'

const testNamespace = 'nginx-test'

test.before('Create a deployment', t => {
    sh.config.silent = true
    const tmpFile = tmp.fileSync()
    fs.writeFileSync(tmpFile.name, deployYaml)
    sh.exec(`kubectl create namespace ${testNamespace}`)
    t.is(
        0,
        sh.exec(`kubectl apply -f ${tmpFile.name} --namespace ${testNamespace}`).code,
        'creating a deployment should work.'
    )
})

test.serial('Deployment should have 2 replicas on start', t => {
    const replicaCount = sh.exec(
        `kubectl get deployment.apps/nginx-deployment-basic --namespace ${testNamespace} -o jsonpath="{.spec.replicas}"`
    ).stdout
    t.is(replicaCount, '2', 'replica count should start out as 2')
})

// test.serial(`Deployment should scale to 10 (the max) within the start and end time and then back to 1 (minReplicaCount)`, t => {
//     t.is(
//         '1',
//         sh.exec(
//             `kubectl get deployment.apps/nginx-deployment-basic --namespace ${testNamespace} -o jsonpath="{.status.readyReplicas}"`
//         ).stdout,
//         'There should be 1 replica for the test-app deployment'
//     )
//
//     // keda based deployment should start scaling up with http requests issued
//     let replicaCount = '0'
//     for (let i = 0; i < 60 && replicaCount !== '5'; i++) {
//         t.log(`Waited ${5 * i} seconds for prometheus-based deployments to scale up`)
//         const jobLogs = sh.exec(`kubectl logs -l job-name=generate-requests -n ${testNamespace}`).stdout
//         t.log(`Logs from the generate requests: ${jobLogs}`)
//
//         replicaCount = sh.exec(
//             `kubectl get deployment.apps/nginx-deployment-basic --namespace ${testNamespace} -o jsonpath="{.spec.replicas}"`
//         ).stdout
//         if (replicaCount !== '5') {
//             sh.exec('sleep 5s')
//         }
//     }
//
//     t.is('10', replicaCount, 'Replica count should be maxed at 10')
//
//     for (let i = 0; i < 50 && replicaCount !== '0'; i++) {
//         replicaCount = sh.exec(
//             `kubectl get deployment.apps/keda-test-app --namespace ${testNamespace} -o jsonpath="{.spec.replicas}"`
//         ).stdout
//         if (replicaCount !== '0') {
//             sh.exec('sleep 5s')
//         }
//     }
//
//     t.is('0', replicaCount, 'Replica count should be 0 after 3 minutes')
// })

test.after.always.cb('clean up deployment', t => {
    sh.exec(`kubectl delete namespace ${testNamespace}`)
    t.end()
})

const deployYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment-basic
  namespace: nginx-test
  labels:
    app: nginx
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: 10.47.2.76:80/nginx:1.17.9
        ports:
        - containerPort: 80
---
apiVersion: keda.k8s.io/v1alpha1
kind: ScaledObject
metadata:
  name: cron-scaledobject
  namespace: nginx-test
spec:
  scaleTargetRef:
    deploymentName: nginx-deployment-basic
  pollingInterval: 30
  minReplicaCount: 1
  maxReplicaCount: 100
  triggers:
  - type: cron
    metadata:
      timezone: Asia/Kolkata
      start: 30 * * * * 
      end: 45 * * * *
      desiredReplicas: "10"
