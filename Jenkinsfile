
pipeline {
    agent {
        label "docker"
    }

    environment {
        IMAGE_TAG = "v1"
    }

    stages {

        stage("Install Dependencies") {
            steps {
                script {
                    sh "docker run --rm -v $WORKSPACE:/app -w /app node:22-alpine npm ci"
                }
            }
        }

        stage("Run Tests") {
            steps {
                script {
                    sh "docker run --rm -e CI=true -v $WORKSPACE:/app -w /app node:22-alpine npm run test"
                }
            }
        }

        stage("Build Application") {
            steps {
                script {
                    sh "docker run --rm -v $WORKSPACE:/app -w /app node:22-alpine npm run build"
                }
            }
        }

        stage("Build Docker Images") {
            steps {
                script {
                    sh "docker build -t ehsooo/smart-inventory-api:${IMAGE_TAG} -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-auth:${IMAGE_TAG} -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-catalog:${IMAGE_TAG} -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-inventory:${IMAGE_TAG} -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-notification:${IMAGE_TAG} -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-reporting:${IMAGE_TAG} -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-client:${IMAGE_TAG} -f apps/web/Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-nginx:${IMAGE_TAG} -f nginx/Dockerfile.dev nginx/"
                }
            }
        }

        stage("Push Images to Docker Hub") {
            steps {
                script {
                    withCredentials([usernamePassword(
                        credentialsId: "dockerhub-creds",
                        usernameVariable: "DOCKER_USER",
                        passwordVariable: "DOCKER_PASS"
                    )]) {
                        sh '''
                            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin

                            docker push ehsooo/smart-inventory-api:v1
                            docker push ehsooo/smart-inventory-auth:v1
                            docker push ehsooo/smart-inventory-catalog:v1
                            docker push ehsooo/smart-inventory-inventory:v1
                            docker push ehsooo/smart-inventory-notification:v1
                            docker push ehsooo/smart-inventory-reporting:v1
                            docker push ehsooo/smart-inventory-client:v1
                            docker push ehsooo/smart-inventory-nginx:v1
                        '''
                    }
                }
            }
        }
    }

    post {
        success {
            echo "CI/CD Pipeline completed successfully!"
        }
        failure {
            echo "Pipeline failed. Check the console output."
        }
    }
}
