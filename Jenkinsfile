
pipeline {
    agent {
        label "docker"
    }

    stages {

        stage("Checkout") {
            steps {
                script {
                    git branch: 'master',
                        url: 'https://github.com/youssefehsann/Smart-Inventory-Management-System-'
                }
            }
        }

        stage("Install Dependencies") {
            steps {
                script {
                    sh "npm ci"
                }
            }
        }

        stage("Build Docker Images") {
            steps {
                script {
                    sh "docker build -t ehsooo/smart-inventory-api:v1 -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-auth:v1 -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-catalog:v1 -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-inventory:v1 -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-notification:v1 -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-reporting:v1 -f Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-client:v1 -f apps/web/Dockerfile.dev ."
                    sh "docker build -t ehsooo/smart-inventory-nginx:v1 -f nginx/Dockerfile.dev nginx/"
                }
            }
        }

        stage("Run Tests") {
            steps {
                script {
                    sh "docker run -e CI=true npm run test"
                }
            }
        }

        stage("Push Images to Docker Hub") {
            steps {
                script {
                    withCredentials([usernamePassword(
                        credentialsId: 'dockerhub-creds',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
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
}
