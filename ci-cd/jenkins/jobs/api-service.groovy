// Jenkins Job DSL 配置
// API Service 专用构建任务

job('api-service-build') {
    description('Build and test API Service')
    
    scm {
        git {
            remote {
                url('${GIT_REPO_URL}')
                credentials('git-credentials')
            }
            branch('*/develop')
        }
    }
    
    triggers {
        scm('H/5 * * * *')  // 每5分钟检查一次
        githubPush()
    }
    
    steps {
        shell('''
            #!/bin/bash
            set -e
            
            echo "📦 Installing dependencies..."
            pnpm install --frozen-lockfile
            
            echo "🔍 Running linter..."
            pnpm lint
            
            echo "🧪 Running tests..."
            pnpm test
            
            echo "📦 Building..."
            pnpm --filter @service/api build
        ''')
    }
    
    publishers {
        archiveArtifacts('apps/api/dist/**')
        junit('apps/api/test-results.xml')
    }
}






























