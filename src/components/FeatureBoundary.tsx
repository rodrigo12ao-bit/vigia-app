import React from 'react';
export class FeatureBoundary extends React.Component<{children:React.ReactNode;onReset:()=>void;onReload?:()=>Promise<void>},{failed:boolean;reloading:boolean;error:string}> {
  state={failed:false,reloading:false,error:''};
  private mounted=false;
  private reloadLock=false;
  componentDidMount(){this.mounted=true;}
  componentWillUnmount(){this.mounted=false;}
  static getDerivedStateFromError(){return {failed:true};}
  private reload=async()=>{
    if(this.reloadLock||!this.props.onReload)return;
    this.reloadLock=true;this.setState({reloading:true,error:''});
    try{await this.props.onReload();if(this.mounted)window.location.reload();}
    catch(error){if(this.mounted)this.setState({error:error instanceof Error?error.message:'Não foi possível salvar antes de recarregar. Tente novamente.'});}
    finally{this.reloadLock=false;if(this.mounted)this.setState({reloading:false});}
  };
  render(){return this.state.failed?<div role="alert" className="p-6 text-center">Este recurso está indisponível. Verifique a conexão e tente novamente. <button className="block mx-auto my-3 p-3 rounded-xl bg-orange-600 text-white" onClick={()=>{this.setState({failed:false,error:''});this.props.onReset();}}>Voltar</button>{this.props.onReload&&<button className="vigia-secondary" disabled={this.state.reloading} onClick={()=>void this.reload()}>{this.state.reloading?'Salvando antes de recarregar…':'Recarregar aplicativo'}</button>}{this.state.error&&<p role="alert" className="mt-3 text-sm">{this.state.error}</p>}</div>:this.props.children;}
}
