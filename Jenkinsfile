
pipeline {
    agent any

    environment {
        DOCKER_USER = 'ehsooo'
        IMAGE_TAG = "${BUILD_NUMBER}"
    }

    stages {
        stage('Build Test Image') {
            steps {
                sh 'docker build -t smart-inventory-test:${BUILD_NUMBER} -f Dockerfile.dev .'
            }
        }

        stage('Run Tests') {
            steps {
                sh 'docker run --rm -e CI=true smart-inventory-test:${BUILD_NUMBER} npm run test'
            }
        }

        stage('Build Application Images') {
            steps {
                sh '''
                    docker tag smart-inventory-test:${BUILD_NUMBER} ${DOCKER_USER}/smart-inventory-api:${BUILD_NUMBER}
                    docker tag smart-inventory-test:${BUILD_NUMBER} ${DOCKER_USER}/smart-inventory-auth:${BUILD_NUMBER}
                    docker tag smart-inventory-test:${BUILD_NUMBER} ${DOCKER_USER}/smart-inventory-catalog:${BUILD_NUMBER}
                    docker tag smart-inventory-test:${BUILD_NUMBER} ${DOCKER_USER}/smart-inventory-inventory:${BUILD_NUMBER}
                    docker tag smart-inventory-test:${BUILD_NUMBER} ${DOCKER_USER}/smart-inventory-notification:${BUILD_NUMBER}
                    docker tag smart-inventory-test:${BUILD_NUMBER} ${DOCKER_USER}/smart-inventory-reporting:${BUILD_NUMBER}

                    docker build -t ${DOCKER_USER}/smart-inventory-client:${BUILD_NUMBER} -f apps/web/Dockerfile.dev .

                    docker build -t ${DOCKER_USER}/smart-inventory-nginx:${BUILD_NUMBER} ./nginx
                '''
            }
        }

        stage('Push Images to Docker Hub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DH_USER',
                    passwordVariable: 'DH_TOKEN'
                )]) {
                    sh '''
                        echo "$DH_TOKEN" | docker login -u "$DH_USER" --password-stdin

                        docker push ${DOCKER_USER}/smart-inventory-api:${BUILD_NUMBER}
                        docker push ${DOCKER_USER}/smart-inventory-auth:${BUILD_NUMBER}
                        docker push ${DOCKER_USER}/smart-inventory-catalog:${BUILD_NUMBER}
                        docker push ${DOCKER_USER}/smart-inventory-inventory:${BUILD_NUMBER}
                        docker push ${DOCKER_USER}/smart-inventory-notification:${BUILD_NUMBER}
                        docker push ${DOCKER_USER}/smart-inventory-reporting:${BUILD_NUMBER}
                        docker push ${DOCKER_USER}/smart-inventory-client:${BUILD_NUMBER}
                        docker push ${DOCKER_USER}/smart-inventory-nginx:${BUILD_NUMBER}

                        docker logout
                    '''
                }
            }
        }
    }

    post {
        success {
            echo 'CI pipeline completed successfully!'
        }
        failure {
            echo 'CI pipeline failed. Check the stage logs.'
        }
    }
}
