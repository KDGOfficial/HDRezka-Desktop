import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { useMediaStore } from '../stores/useMediaStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught unhandled React error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    useMediaStore.getState().setPage('home');
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen w-full cinema-canvas text-white p-6 select-none">
          <div className="max-w-md w-full cinema-panel rounded-3xl p-7 shadow-elevated text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-brand-crimson/20 border border-brand-ember/40 text-brand-orange flex items-center justify-center mx-auto shadow-glow-sm">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="font-display text-xl font-black text-white">Произошла непредвиденная ошибка</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {this.state.error?.message || 'Не удалось корректно отобразить страницу.'}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full btn-ember text-white text-xs font-extrabold cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Перезагрузить</span>
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-bold cursor-pointer active:scale-95"
              >
                <Home className="w-4 h-4" />
                <span>На главную</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
