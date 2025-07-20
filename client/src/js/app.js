// 主应用文件
import { createRouter, createWebHistory } from './router.js';
import { createStore } from './store.js';
import { setupAxios } from '../services/api.js';
import { socketService } from '../services/socket.js';

// 导入组件
import HomeComponent from '../components/Home.js';
import LoginComponent from '../components/Login.js';
import GameComponent from '../components/Game.js';
import RoomsComponent from '../components/Rooms.js';
import ProfileComponent from '../components/Profile.js';
import LeaderboardComponent from '../components/Leaderboard.js';
import AppointmentComponent from '../components/Appointment.js';

const { createApp, ref, reactive, computed, onMounted, onUnmounted } = Vue;
const { ElMessage, ElMessageBox, ElNotification } = ElementPlus;

// 主应用组件
const App = {
    name: 'App',
    setup() {
        // 响应式数据
        const isLoading = ref(false);
        const currentUser = ref(null);
        const isAuthenticated = computed(() => !!currentUser.value);
        const onlineCount = ref(0);
        const notifications = ref([]);
        const currentTheme = ref('classic');

        // 主题选项
        const themes = [
            { value: 'classic', label: '经典古风', color: '#8B4513' },
            { value: 'modern', label: '现代简约', color: '#409EFF' },
            { value: 'dark', label: '暗夜模式', color: '#303133' }
        ];

        // 初始化应用
        const initApp = async () => {
            try {
                isLoading.value = true;
                
                // 设置Axios拦截器
                setupAxios();
                
                // 检查本地存储的token
                const token = localStorage.getItem('chess_token');
                if (token) {
                    try {
                        const response = await axios.get('/api/auth/me');
                        if (response.data.success) {
                            currentUser.value = response.data.data.user;
                            // 初始化Socket连接
                            await socketService.connect(token);
                        }
                    } catch (error) {
                        console.error('验证token失败:', error);
                        localStorage.removeItem('chess_token');
                        localStorage.removeItem('chess_refresh_token');
                    }
                }
                
                // 加载主题设置
                const savedTheme = localStorage.getItem('chess_theme') || 'classic';
                currentTheme.value = savedTheme;
                applyTheme(savedTheme);
                
            } catch (error) {
                console.error('应用初始化失败:', error);
                ElMessage.error('应用初始化失败');
            } finally {
                isLoading.value = false;
            }
        };

        // 应用主题
        const applyTheme = (theme) => {
            const root = document.documentElement;
            
            switch (theme) {
                case 'classic':
                    root.style.setProperty('--primary-color', '#8B4513');
                    root.style.setProperty('--primary-light', '#CD853F');
                    root.style.setProperty('--background-color', '#FDF5E6');
                    root.style.setProperty('--surface-color', '#FFFEF7');
                    break;
                case 'modern':
                    root.style.setProperty('--primary-color', '#409EFF');
                    root.style.setProperty('--primary-light', '#79bbff');
                    root.style.setProperty('--background-color', '#f0f2f5');
                    root.style.setProperty('--surface-color', '#ffffff');
                    break;
                case 'dark':
                    root.style.setProperty('--primary-color', '#409EFF');
                    root.style.setProperty('--primary-light', '#79bbff');
                    root.style.setProperty('--background-color', '#1a1a1a');
                    root.style.setProperty('--surface-color', '#2d2d2d');
                    break;
            }
        };

        // 切换主题
        const changeTheme = (theme) => {
            currentTheme.value = theme;
            localStorage.setItem('chess_theme', theme);
            applyTheme(theme);
            ElMessage.success(`已切换到${themes.find(t => t.value === theme)?.label}主题`);
        };

        // 登录
        const login = async (userData) => {
            currentUser.value = userData;
            // 连接Socket
            const token = localStorage.getItem('chess_token');
            if (token) {
                await socketService.connect(token);
            }
        };

        // 登出
        const logout = async () => {
            try {
                await axios.post('/api/auth/logout');
            } catch (error) {
                console.error('登出请求失败:', error);
            } finally {
                currentUser.value = null;
                localStorage.removeItem('chess_token');
                localStorage.removeItem('chess_refresh_token');
                socketService.disconnect();
                ElMessage.success('已成功登出');
            }
        };

        // Socket事件监听
        const setupSocketListeners = () => {
            // 在线人数更新
            socketService.on('online:count', (data) => {
                onlineCount.value = data.count;
            });

            // 系统通知
            socketService.on('notification', (notification) => {
                notifications.value.unshift(notification);
                ElNotification({
                    title: notification.title,
                    message: notification.content,
                    type: notification.type || 'info',
                    duration: 5000
                });
            });

            // 游戏邀请
            socketService.on('game:invite', (data) => {
                ElMessageBox.confirm(
                    `${data.fromUser} 邀请您进行对局，是否接受？`,
                    '游戏邀请',
                    {
                        confirmButtonText: '接受',
                        cancelButtonText: '拒绝',
                        type: 'info'
                    }
                ).then(() => {
                    socketService.emit('game:invite_response', {
                        inviteId: data.inviteId,
                        accept: true
                    });
                }).catch(() => {
                    socketService.emit('game:invite_response', {
                        inviteId: data.inviteId,
                        accept: false
                    });
                });
            });

            // 好友请求
            socketService.on('friend:request', (data) => {
                ElNotification({
                    title: '好友请求',
                    message: `${data.fromUser} 想要添加您为好友`,
                    type: 'info',
                    duration: 0,
                    onClick: () => {
                        // 跳转到好友管理页面
                        router.push('/profile?tab=friends');
                    }
                });
            });
        };

        // 生命周期
        onMounted(() => {
            initApp();
            setupSocketListeners();
        });

        onUnmounted(() => {
            socketService.disconnect();
        });

        return {
            isLoading,
            currentUser,
            isAuthenticated,
            onlineCount,
            notifications,
            currentTheme,
            themes,
            changeTheme,
            login,
            logout
        };
    },
    
    template: `
        <div id="app" class="app-container">
            <!-- 顶部导航栏 -->
            <el-header class="app-header" height="60px">
                <div class="header-content">
                    <!-- Logo -->
                    <div class="logo" @click="$router.push('/')">
                        <span class="logo-text">NL象棋</span>
                    </div>
                    
                    <!-- 导航菜单 -->
                    <el-menu 
                        :default-active="$route.path" 
                        class="nav-menu" 
                        mode="horizontal"
                        router
                    >
                        <el-menu-item index="/">首页</el-menu-item>
                        <el-menu-item index="/rooms" v-if="isAuthenticated">对局大厅</el-menu-item>
                        <el-menu-item index="/leaderboard">排行榜</el-menu-item>
                        <el-menu-item index="/appointment" v-if="isAuthenticated">预约对局</el-menu-item>
                    </el-menu>
                    
                    <!-- 右侧工具栏 -->
                    <div class="header-tools">
                        <!-- 在线人数 -->
                        <div class="online-count" v-if="onlineCount > 0">
                            <el-icon><User /></el-icon>
                            <span>{{ onlineCount }}</span>
                        </div>
                        
                        <!-- 主题切换 -->
                        <el-dropdown @command="changeTheme" class="theme-selector">
                            <el-button type="text" class="theme-btn">
                                <el-icon><Brush /></el-icon>
                            </el-button>
                            <template #dropdown>
                                <el-dropdown-menu>
                                    <el-dropdown-item 
                                        v-for="theme in themes" 
                                        :key="theme.value"
                                        :command="theme.value"
                                        :class="{ active: currentTheme === theme.value }"
                                    >
                                        <div class="theme-option">
                                            <div 
                                                class="theme-color" 
                                                :style="{ backgroundColor: theme.color }"
                                            ></div>
                                            <span>{{ theme.label }}</span>
                                        </div>
                                    </el-dropdown-item>
                                </el-dropdown-menu>
                            </template>
                        </el-dropdown>
                        
                        <!-- 用户菜单 -->
                        <div v-if="isAuthenticated" class="user-menu">
                            <el-dropdown @command="handleUserCommand">
                                <div class="user-info">
                                    <el-avatar :size="32" :src="currentUser?.avatar_url">
                                        {{ currentUser?.username?.charAt(0) }}
                                    </el-avatar>
                                    <span class="username">{{ currentUser?.username }}</span>
                                    <el-icon><ArrowDown /></el-icon>
                                </div>
                                <template #dropdown>
                                    <el-dropdown-menu>
                                        <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                                        <el-dropdown-item command="settings">设置</el-dropdown-item>
                                        <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
                                    </el-dropdown-menu>
                                </template>
                            </el-dropdown>
                        </div>
                        
                        <!-- 登录按钮 -->
                        <el-button 
                            v-else 
                            type="primary" 
                            @click="$router.push('/login')"
                        >
                            登录
                        </el-button>
                    </div>
                </div>
            </el-header>
            
            <!-- 主要内容区域 -->
            <el-main class="app-main">
                <router-view 
                    :user="currentUser" 
                    @login="login"
                    @logout="logout"
                />
            </el-main>
            
            <!-- 全局加载遮罩 -->
            <el-loading 
                :visible="isLoading" 
                text="加载中..." 
                background="rgba(0, 0, 0, 0.8)"
            />
        </div>
    `,
    
    methods: {
        handleUserCommand(command) {
            switch (command) {
                case 'profile':
                    this.$router.push('/profile');
                    break;
                case 'settings':
                    // 打开设置对话框
                    break;
                case 'logout':
                    this.logout();
                    break;
            }
        }
    }
};

// 创建应用实例
let app;

export function startApp() {
    // 创建路由
    const router = createRouter({
        history: createWebHistory(),
        routes: [
            { path: '/', component: HomeComponent },
            { path: '/login', component: LoginComponent },
            { path: '/game/:roomId?', component: GameComponent },
            { path: '/rooms', component: RoomsComponent },
            { path: '/profile', component: ProfileComponent },
            { path: '/leaderboard', component: LeaderboardComponent },
            { path: '/appointment', component: AppointmentComponent }
        ]
    });

    // 创建状态管理
    const store = createStore();

    // 创建应用
    app = createApp(App);
    
    // 使用插件
    app.use(ElementPlus);
    app.use(router);
    app.use(store);

    // 全局属性
    app.config.globalProperties.$message = ElMessage;
    app.config.globalProperties.$messageBox = ElMessageBox;
    app.config.globalProperties.$notification = ElNotification;

    // 挂载应用
    app.mount('#app');

    console.log('NL象棋应用启动成功');
}

// 导出应用实例（用于调试）
export { app };