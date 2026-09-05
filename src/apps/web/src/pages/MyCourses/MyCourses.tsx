import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { fetch as Fetch } from '../../utils/request';
import { courses_api } from '../../config/api';
import './MyCourses.css';

interface MyCourse {
  courseId: string;
  classId: string;
  name: string;
  className: string;
  image: string;
  teacher: string;
  studentCount: number | null;
}

/**
 * [定制功能] 我的课程页面
 * - 基于现有登录鉴权体系：从 IndexedDB('ui'/'user') 按手机号读取当前用户
 * - 未登录（本地无该用户）自动跳转至登录页（首页 Start）
 * - 课程数据由后端按当前用户凭据(_uid/_d/vc3)过滤，仅返回本人课程
 * - 加载中 / 空列表 / 加载失败（含身份过期）分别给出清晰提示
 */
function MyCourses() {
  const params = useParams();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);      // 登录态检查是否完成
  const [authenticated, setAuthenticated] = useState(false);  // 是否已登录
  const [courses, setCourses] = useState<MyCourse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'' | 'AuthFailed' | 'ParseError' | 'Network'>('');
  const [reloadFlag, setReloadFlag] = useState(0);

  // 登录态检查（与 DashBoard 相同的 IndexedDB 方式）
  useEffect(() => {
    const request = indexedDB.open('ui');
    request.onerror = () => {
      setAuthenticated(false);
      setAuthChecked(true);
    };
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('user', 'readonly').objectStore('user').get(params.phone as string);
      get.onsuccess = () => {
        const user = get.result;
        // 本地无该用户或凭据不完整 → 视为未登录
        setAuthenticated(!!(user && user._uid && user._d && user.vc3));
        setAuthChecked(true);
      };
      get.onerror = () => {
        setAuthenticated(false);
        setAuthChecked(true);
      };
    };
  }, [params.phone]);

  // 拉取当前用户的课程列表
  useEffect(() => {
    if (!authChecked || !authenticated) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        // 重新读取一次凭据（避免首次渲染时闭包拿到空值）
        const db = (indexedDB as any);
        const req = db.open('ui');
        const creds: any = await new Promise((resolve) => {
          req.onsuccess = () => {
            const get = req.result.transaction('user', 'readonly').objectStore('user').get(params.phone as string);
            get.onsuccess = () => resolve(get.result);
            get.onerror = () => resolve(null);
          };
          req.onerror = () => resolve(null);
        });
        if (cancelled) return;
        if (!creds) {
          setAuthenticated(false);
          return;
        }
        const res = await Fetch(courses_api, {
          method: 'POST',
          body: {
            uid: creds._uid,
            _d: creds._d,
            vc3: creds.vc3,
          },
        });
        if (cancelled) return;
        if (res === 'AuthFailed') setError('AuthFailed');
        else if (typeof res === 'string') setError('ParseError');
        else setCourses(res);
      } catch (e) {
        if (!cancelled) setError('Network');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authChecked, authenticated, params.phone, reloadFlag]);

  // 未登录访问：自动跳转至登录页
  if (authChecked && !authenticated) {
    return <Navigate to="/" replace />;
  }

  const handleRetry = () => setReloadFlag((f) => f + 1);

  return (
    <div className="mycourses-page">
      <h1>我的课程</h1>

      {
        loading &&
        <div className="mycourses-center">
          <CircularProgress size="4.5rem" />
          <Typography color="#7b8a97">课程加载中...</Typography>
        </div>
      }

      {
        !loading && error === 'AuthFailed' &&
        <div className="mycourses-center">
          <Alert severity="warning">登录身份已过期，请返回首页重新登录后再查看课程</Alert>
          <ButtonBase className="mycourses-button" onClick={() => navigate('/', { replace: true })}>
            <span className="mycourses-button-text">返回登录</span>
          </ButtonBase>
        </div>
      }

      {
        !loading && (error === 'ParseError' || error === 'Network') &&
        <div className="mycourses-center">
          <Alert severity="error">课程加载失败，请检查网络连接后重试</Alert>
          <ButtonBase className="mycourses-button" onClick={handleRetry}>
            <span className="mycourses-button-text">重新加载</span>
          </ButtonBase>
        </div>
      }

      {
        !loading && !error && courses !== null && courses.length === 0 &&
        <div className="mycourses-center">
          <Typography variant="h6" style={{ color: '#4c5e6d' }}>暂无课程</Typography>
          <Typography color="#7b8a97">当前账号还没有已选课程，去学习通选择课程后 再来看看吧</Typography>
        </div>
      }

      {
        !loading && !error && courses !== null && courses.length > 0 &&
        <>
          <p className="mycourses-count">共 {courses.length} 门课程</p>
          <div className="mycourses-grid">
            {
              courses.map((c, i) => (
                <Box
                  key={`${c.courseId}-${c.classId}-${i}`}
                  className="course-card"
                  title={`${c.name}（${c.className}）`}
                >
                  <div className="course-cover">
                    {
                      c.image
                        ? <img
                            src={c.image}
                            alt={c.name}
                            loading="lazy"
                            onError={(e) => {
                              // 封面加载失败时显示占位
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).parentElement
                                ?.querySelector('.course-cover-placeholder')
                                ?.classList.remove('course-cover-hidden');
                            }}
                          />
                        : null
                    }
                    <div className={`course-cover-placeholder${c.image ? ' course-cover-hidden' : ''}`}>
                      {(c.name || '课').slice(0, 1)}
                    </div>
                  </div>
                  <div className="course-info">
                    <p className="course-name" title={c.name}>{c.name}</p>
                    <p className="course-meta" title={c.className}>{c.className}</p>
                    <p className="course-meta">
                      {c.teacher ? `教师：${c.teacher}` : ''}
                      {c.studentCount !== null ? `${c.teacher ? ' · ' : ''}${c.studentCount} 人` : ''}
                    </p>
                  </div>
                </Box>
              ))
            }
          </div>
        </>
      }
    </div>
  );
}

export default MyCourses;
