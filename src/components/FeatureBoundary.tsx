import React from 'react';
export class FeatureBoundary extends React.Component<{children:React.ReactNode;onReset:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div role="alert" className="p-6 text-center">Este recurso está indisponível. Verifique a conexão e tente novamente. <button className="block mx-auto my-3 p-3 rounded-xl bg-orange-600 text-white" onClick={()=>{this.setState({failed:false});this.props.onReset();}}>Voltar</button></div>:this.props.children;}
}
