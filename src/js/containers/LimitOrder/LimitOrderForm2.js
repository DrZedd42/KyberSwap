import React, { Fragment } from "react"
import { connect } from "react-redux"
import { getTranslate } from 'react-localize-redux'
import { filterInputNumber } from "../../utils/validators";
import * as limitOrderActions from "../../actions/limitOrderActions"
import * as constants from "../../services/constants"
import { LimitOrderCompareRate, LimitOrderSubmit, LimitOrderFee } from "../LimitOrder";
import { ForceCancelOrderModal } from "../LimitOrder/LimitOrderModals";
import * as converters from "../../utils/converter";

@connect((store, props) => {
  const account = store.account.account;
  const translate = getTranslate(store.locale);
  const tokens = store.tokens.tokens;
  const limitOrder = store.limitOrder;
  const modifiedTokens = props.availableBalanceTokens();
  const isBuyForm = props.formType === 'buy';
  const baseSymbol = limitOrder.sourceTokenSymbol;
  const quoteSymbol = limitOrder.destTokenSymbol;
  const baseToken = modifiedTokens.find(token => token.symbol === baseSymbol);
  const quoteToken = modifiedTokens.find(token => token.symbol === quoteSymbol);
  let sourceToken = baseToken;
  let destToken = quoteToken;
  let srcTokenSymbol = baseSymbol;
  let destTokenSymbol = quoteSymbol;

  if (isBuyForm) {
    sourceToken = quoteToken;
    destToken = baseToken;
    srcTokenSymbol = quoteSymbol;
    destTokenSymbol = baseSymbol;
  }
  
  return {
    translate, limitOrder, tokens, account, srcTokenSymbol, destTokenSymbol,
    baseSymbol, quoteSymbol, sourceToken, destToken, modifiedTokens, isBuyForm
  }
})
export default class LimitOrderForm2 extends React.Component {
  constructor(props) {
    super(props);
    
    this.state = {
      formType: 'buy',
      rate: 'Loading...',
      srcAmount: '',
      destAmount: '',
      priceErrors: [],
      amountErrors: [],
      cancelOrderModal: false
    }
  }
  
  componentDidMount(prevProps) {
    const { triggerBuyRate, triggerSellRate } = this.props.limitOrder;
    this.setState({ rate: this.props.isBuyForm ? triggerBuyRate : triggerSellRate })
  }
  
  componentDidUpdate(prevProps) {
    if (this.props.isBuyForm && this.props.limitOrder.triggerBuyRate !== prevProps.limitOrder.triggerBuyRate) {
      this.setState({ rate: this.props.limitOrder.triggerBuyRate })
    } else if (!this.props.isBuyForm && this.props.limitOrder.triggerSellRate !== prevProps.limitOrder.triggerSellRate) {
      this.setState({ rate: this.props.limitOrder.triggerSellRate })
    }
  }
  
  addPriceError = (error) => {
    this.setState({
      priceErrors: [...this.state.priceErrors, error]
    })
  };
  
  addAmountError = (error) => {
    this.setState({
      amountErrors: [...this.state.amountErrors, error]
    })
  };
  
  clearErrors = () => {
    this.setState({
      priceErrors: [],
      amountErrors: []
    })
  };
  
  toggleCancelOrderModal = (isOpened) => {
    this.setState({ cancelOrderModal: isOpened })
  };
  
  getInputValue = (e, refValue) => {
    const value = e.target.value;
    
    const isValueValid = filterInputNumber(e, value, refValue);

    if (!isValueValid || value < 0) return false;
    
    return value;
  };
  
  handleRateChanged = (e) => {
    this.clearErrors();
    
    const value = this.getInputValue(e, this.state.rate);
    if (value === false) return;
  
    this.setState({ rate: value });
    
    const sourceDecimals = this.props.sourceToken.decimals;
    const destDecimals = this.props.destToken.decimals;
  
    if (this.props.isBuyForm) {
      const triggerRate = converters.divOfTwoNumber(1, value);
      const sourceAmount = converters.caculateSourceAmount(this.state.destAmount, converters.roundingRate(triggerRate), sourceDecimals);
      this.setState({ srcAmount: sourceAmount });
    } else {
      const destAmount = converters.caculateDestAmount(this.state.srcAmount, converters.roundingRate(value), destDecimals);
      this.setState({ destAmount: destAmount });
    }
  };
  
  handleSrcAmountChanged = (e, value) => {
    this.clearErrors();
    
    value = value ? value : this.getInputValue(e, this.state.srcAmount);
    if (value === false) return;
  
    this.setState({ srcAmount: value });
    
    const destDecimals = this.props.destToken.decimals;
    const bigRate = this.props.isBuyForm ? converters.roundingRate(converters.divOfTwoNumber(1, this.state.rate))
      : converters.roundingRate(this.state.rate);
    const destAmount = converters.caculateDestAmount(value, bigRate, destDecimals);

    this.setState({ destAmount: destAmount });
  };
  
  handleDestAmountChanged = (e, value) => {
    this.clearErrors();
    
    value = value ? value : this.getInputValue(e, this.state.destAmount);
    if (value === false) return;
    
    this.setState({ destAmount: value });
    
    const srcDecimals = this.props.sourceToken.decimals;
    const bigRate = this.props.isBuyForm ? converters.roundingRate(converters.divOfTwoNumber(1, this.state.rate))
      : converters.roundingRate(this.state.rate);
    const srcAmount = converters.caculateSourceAmount(value, bigRate, srcDecimals);
    
    this.setState({ srcAmount: srcAmount });
  };
  
  getMaxGasApprove = () => {
    const tokens = this.props.tokens;
    const sourceSymbol = this.props.baseSymbol;
    
    if (tokens[sourceSymbol] && tokens[sourceSymbol].gasApprove) {
      return tokens[sourceSymbol].gasApprove
    } else {
      return this.props.limitOrder.max_gas_approve
    }
  };
  
  getMaxGasExchange = () => {
    const tokens = this.props.tokens;
    const destTokenSymbol = 'WETH';
    
    return tokens[destTokenSymbol] && tokens[destTokenSymbol].gasLimit ? tokens[destTokenSymbol].gasLimit : this.props.limitOrder.max_gas;
  };
  
  calculateMaxFee = () => {
    const gasApprove = this.getMaxGasApprove();
    const gasExchange = this.getMaxGasExchange();
    const totalGas = gasExchange + gasApprove * 2;
    
    return converters.totalFee(this.props.limitOrder.gasPrice, totalGas);
  };
  
  addAmountByBalancePercentage = (balancePercentage) => {
    const sourceToken = this.props.sourceToken;
    
    let sourceAmountByPercentage = converters.getBigNumberValueByPercentage(sourceToken.balance, balancePercentage);

    if (this.props.srcTokenSymbol === 'WETH' && balancePercentage === 100) {
      const ethBalance = this.props.tokens["ETH"].balance;
      const fee = this.calculateMaxFee();
      
      if (converters.compareTwoNumber(ethBalance, fee) === 1) {
        sourceAmountByPercentage = converters.subOfTwoNumber(sourceAmountByPercentage, fee)
      } else {
        sourceAmountByPercentage = converters.subOfTwoNumber(sourceAmountByPercentage, ethBalance)
      }
    }
    
    if (converters.compareTwoNumber(sourceAmountByPercentage, 0) === -1) sourceAmountByPercentage = 0;
    
    const amount = converters.toT(sourceAmountByPercentage, sourceToken.decimals);
    
    this.handleSrcAmountChanged(false, amount);
  };
  
  toggleAgreeSubmit = () => {
    const { isAgreeForceSubmit, isDisableSubmit } = this.props.limitOrder;
    
    if (!isAgreeForceSubmit) {
      this.props.dispatch(limitOrderActions.setForceSubmitRate(this.state.rate));
    }
    
    this.props.dispatch(limitOrderActions.setIsDisableSubmit(!isDisableSubmit));
    this.props.dispatch(limitOrderActions.setAgreeForceSubmit(!isAgreeForceSubmit));
  };
  
  getListWarningOrdersComp = () => {
    if (!this.props.account) return [];
    
    let higherRateOrders = [];
    const triggerRate = this.state.rate;
    
    if (this.props.limitOrder.filterMode === "client") {
      higherRateOrders = this.props.limitOrder.listOrder.filter(item => {
        const pairComparison = this.props.baseSymbol === item.source && this.props.quoteSymbol === item.dest;
        
        if (pairComparison) {
          const rateComparison = converters.compareTwoNumber(item.min_rate, triggerRate) > 0;
          return item.user_address.toLowerCase() === this.props.account.address.toLowerCase() &&
            item.status === constants.LIMIT_ORDER_CONFIG.status.OPEN &&
            rateComparison;
        }
      });
    } else {
      higherRateOrders = this.props.limitOrder.relatedOrders;
    }
    
    return higherRateOrders
  };
  
  resetToMarketRate = () => {
    const offeredRate = this.props.isBuyForm ? converters.toT(this.props.limitOrder.buyRate) : converters.toT(this.props.limitOrder.sellRate);
    
    if (!+offeredRate) {
      this.setState({ rate: 0 });
      return;
    }
    
    const formattedOfferedRate = this.props.isBuyForm ? converters.divOfTwoNumber(1, offeredRate) : offeredRate;
    this.setState({ rate: converters.roundingRateNumber(formattedOfferedRate) });
  };
  
  renderErrorsAndCompareRate = (errors, renderRateError = false, renderCompareRate = false) => {
    const rateError = this.props.limitOrder.errors.rateSystem;
    const isRateError = renderRateError && rateError;
    const isError = errors.length || rateError;
    
    return (
      <Fragment>
        {isError && (
          <div className="exchange__error common__slide-up">
            {!isRateError && errors.map((error, index) => {
              return <div className="exchange__error-item" key={index}>{error}</div>
            })}
    
            {isRateError && (
              <div className="exchange__error-item">{rateError}</div>
            )}
          </div>
        )}
        
        {!isError && renderCompareRate && (
          <LimitOrderCompareRate
            triggerRate={this.state.rate}
            isBuyForm={this.props.isBuyForm}
          />
        )}
      </Fragment>
    )
  };
  
  render() {
    const displayQuoteSymbol = this.props.quoteSymbol === 'WETH' ? constants.WETH_SUBSTITUTE_NAME : this.props.quoteSymbol;
    const displaySrcSymbol = this.props.srcTokenSymbol === 'WETH' ? constants.WETH_SUBSTITUTE_NAME : this.props.srcTokenSymbol;
    const marketText = this.props.translate(`limit_order.${this.props.formType}`, { symbol: this.props.baseSymbol });
    
    return (
      <div className={"limit-order-form theme__background-2"}>
        <div className={"limit-order-form__header-desktop theme__border-2"}>
          <div>{marketText}</div>
        </div>
        
        <div className={"limit-order-form__item theme__background-4 theme__text-2"}>
          <div className={"limit-order-form__tag clickable theme__input-tag"} onClick={this.resetToMarketRate}>
            {this.props.translate("limit_order.price") || "Price"}
          </div>
          <input
            className={"limit-order-form__input theme__text-2"}
            step="0.000001"
            placeholder="0"
            min="0"
            type="text"
            maxLength="50"
            autoComplete="off"
            value={this.props.limitOrder.isFetchingRate ? 'Loading...' : this.state.rate}
            onChange={this.handleRateChanged}
            disabled={this.props.limitOrder.isFetchingRate}
          />
          <div className={"limit-order-form__symbol theme__text-3"}>{displayQuoteSymbol}</div>
        </div>
  
        {this.renderErrorsAndCompareRate(this.state.priceErrors, true, true)}
        
        <div className={"limit-order-form__item theme__background-4 theme__text-2"}>
          <div className={"limit-order-form__tag theme__input-tag"}>{this.props.translate("limit_order.amount") || "Amount"}</div>
          {this.props.isBuyForm && (
            <input
              className={"limit-order-form__input theme__text-2"}
              step="0.000001"
              placeholder="0"
              min="0"
              type="text"
              maxLength="50"
              autoComplete="off"
              value={this.state.destAmount}
              onChange={this.handleDestAmountChanged}
            />
          )}
          
          {!this.props.isBuyForm && (
            <input
              className={"limit-order-form__input theme__text-2"}
              step="0.000001"
              placeholder="0"
              min="0"
              type="text"
              maxLength="50"
              autoComplete="off"
              value={this.state.srcAmount}
              onChange={this.handleSrcAmountChanged}
            />
          )}
          <div className={"limit-order-form__symbol theme__text-3"}>{this.props.baseSymbol}</div>
        </div>
  
        {this.renderErrorsAndCompareRate(this.state.amountErrors)}
        
        {this.props.account &&
          <div className="common__mt-15">
            <div className={'common__balance common__balance--full-width theme__text-2'}>
              <div className={'common__balance-item theme__button-2'} onClick={() => this.addAmountByBalancePercentage(25)}>25%</div>
              <div className={'common__balance-item theme__button-2'} onClick={() => this.addAmountByBalancePercentage(50)}>50%</div>
              <div className={'common__balance-item theme__button-2'} onClick={() => this.addAmountByBalancePercentage(75)}>75%</div>
              <div className={'common__balance-item theme__button-2'} onClick={() => this.addAmountByBalancePercentage(100)}>100%</div>
            </div>
  
            <div className={"theme__text-4 common__flexbox"}>
              <div className={"limit-order-form__available"}>{this.props.translate("limit_order.available_balance") || "Available Balance"}:</div>
              <div className={"limit-order-form__token"}>
                {converters.formatNumber(converters.toT(this.props.sourceToken.balance, this.props.sourceToken.decimals), 6)} {displaySrcSymbol}
              </div>
            </div>
          </div>
        }
        
        <LimitOrderFee
          isBuyForm={this.props.isBuyForm}
          sourceAmount={this.state.srcAmount}
          destAmount={this.state.destAmount}
          srcTokenSymbol={this.props.srcTokenSymbol}
          destTokenSymbol={this.props.destTokenSymbol}
          quoteSymbol={displayQuoteSymbol}
        />
        
        <LimitOrderSubmit
          sourceToken={this.props.sourceToken}
          destToken={this.props.destToken}
          baseSymbol={this.props.baseSymbol}
          quoteSymbol={this.props.quoteSymbol}
          sourceAmount={this.state.srcAmount}
          destAmount={this.state.destAmount}
          triggerRate={this.state.rate}
          isBuyForm={this.props.isBuyForm}
          availableBalanceTokens={this.props.modifiedTokens}
          getOpenOrderAmount={this.props.getOpenOrderAmount}
          addPriceError={this.addPriceError}
          addAmountError={this.addAmountError}
          clearErrors={this.clearErrors}
          toggleCancelOrderModal={this.toggleCancelOrderModal}
          marketText={marketText}
        />
        
        {this.state.cancelOrderModal && (
          <ForceCancelOrderModal
            toggleAgreeSubmit={this.toggleAgreeSubmit}
            getListWarningOrdersComp={this.getListWarningOrdersComp}
          />
        )}
      </div>
    )
  }
}
